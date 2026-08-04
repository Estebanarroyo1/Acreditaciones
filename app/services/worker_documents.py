"""
Date resolution pipeline shared by upload_document and edit_document.

Steps in order:
  1. Parse ISO date strings (raise 422 on bad format)
  2. AI extraction fallback (fills missing dates from the uploaded file)
  3. validity_days last-resort fallback (issue_date + validity_days)
  4. Fail-fast: block already-expired documents (raise 400)
"""

import logging
from datetime import date, timedelta

from fastapi import HTTPException, UploadFile, status

logger = logging.getLogger(__name__)


def _parse_iso_dates(
    issue_date: str | None,
    expiry_date: str | None,
) -> tuple[date | None, date | None]:
    parsed_issue: date | None = None
    parsed_expiry: date | None = None
    try:
        if issue_date:
            parsed_issue = date.fromisoformat(issue_date)
        if expiry_date:
            parsed_expiry = date.fromisoformat(expiry_date)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Formato de fecha inválido. Use YYYY-MM-DD.",
        )
    return parsed_issue, parsed_expiry


async def resolve_document_dates(
    issue_date_str: str | None,
    expiry_date_str: str | None,
    file: UploadFile | None,
    doc_type_name: str | None,
    effective_validity_days: int | None,
    ai_enabled: bool = True,
    expected_person_name: str | None = None,
) -> tuple[date | None, date | None, dict | None]:
    """
    Returns (parsed_issue, parsed_expiry, ai_result).
    `ai_result` es el dict del extractor (veredictos de tipo/identidad + fechas) o
    None si la IA no corrió (tipo manual, sin API key, sin archivo, o falló).
    Side-effect: seeks file back to position 0 after AI read (if AI ran).

    Si `ai_enabled` es False (el tipo de documento tiene la validación de IA
    apagada), se omite por completo la extracción de fechas por IA: se usan solo
    las fechas manuales + el fallback por validity_days. Esto evita el costo de
    la llamada a OpenAI para esos tipos.

    `expected_person_name` (nombre del worker dueño del perfil) se pasa al extractor
    para verificar identidad (solo por nombre). La COMBINACIÓN de veredictos y la
    política silencio/aviso/confirmación las decide el endpoint de subida con
    `app/services/ai_validation.py`; esta función solo resuelve fechas.
    """
    from app.core.config import settings

    parsed_issue, parsed_expiry = _parse_iso_dates(issue_date_str, expiry_date_str)
    ai_result: dict | None = None

    if file is not None and ai_enabled and settings.OPENAI_API_KEY:
        from openai import APITimeoutError

        from app.services.storage import read_upload_capped
        from app.services.worker_ai_extractor import extract_dates

        # Aplica el límite de tamaño ANTES de enviar nada a OpenAI.
        content = await read_upload_capped(file)
        try:
            ai = await extract_dates(
                content,
                file.content_type or "",
                file.filename or "",
                doc_type_name,
                expected_person_name,
            )
            ai_result = ai
            if parsed_issue is None and ai.get("issue_date"):
                try:
                    parsed_issue = date.fromisoformat(ai["issue_date"])
                except ValueError:
                    pass
            if parsed_expiry is None and ai.get("expiry_date"):
                try:
                    parsed_expiry = date.fromisoformat(ai["expiry_date"])
                except ValueError:
                    pass
        except APITimeoutError:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="El análisis del documento tardó demasiado.",
            )
        except Exception:
            # AI failure is non-blocking: continue without the extracted dates.
            logger.warning(
                "AI date extraction failed for %s; continuing without it.",
                file.filename or "<unknown>",
                exc_info=True,
            )
        await file.seek(0)

    if parsed_expiry is None and effective_validity_days and parsed_issue:
        parsed_expiry = parsed_issue + timedelta(days=effective_validity_days)

    if parsed_expiry is not None and parsed_expiry < date.today():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Bloqueo del sistema: El documento ya se encuentra vencido. "
                f"Fecha de caducidad calculada: {parsed_expiry.strftime('%d-%m-%Y')}. "
                f"No se permite su ingreso."
            ),
        )

    return parsed_issue, parsed_expiry, ai_result
