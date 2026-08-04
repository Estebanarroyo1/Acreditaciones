"""
Resolución de fechas para subida/edición de documentos (carga manual, sin IA).

Reglas:
  1. Parsear las fechas ISO recibidas del formulario (422 si el formato es inválido).
  2. Si el tipo tiene vigencia configurada (`effective_validity_days`): la fecha de
     vencimiento se CALCULA SIEMPRE como `issue_date + validity_days` (se ignora
     cualquier `expiry_date` manual). Requiere `issue_date` (422 si falta).
  3. Si el tipo NO tiene vigencia: el vencimiento es MANUAL y obligatorio
     (422 si falta).
  4. Escudo de vigencia: se bloquea un documento ya vencido (400).
"""

from datetime import date, timedelta

from fastapi import HTTPException, status


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


def resolve_document_dates(
    issue_date_str: str | None,
    expiry_date_str: str | None,
    effective_validity_days: int | None,
) -> tuple[date | None, date | None]:
    """Devuelve `(issue, expiry)` a partir de las fechas manuales del formulario y la
    vigencia del tipo de documento. Lanza 422/400 según las reglas del módulo."""
    parsed_issue, parsed_expiry = _parse_iso_dates(issue_date_str, expiry_date_str)

    if effective_validity_days:
        # Vigencia configurada: el vencimiento SIEMPRE se calcula (ignora el manual).
        if parsed_issue is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Debes indicar la fecha de emisión para calcular el vencimiento.",
            )
        parsed_expiry = parsed_issue + timedelta(days=effective_validity_days)
    else:
        # Sin vigencia configurada: el vencimiento es manual y obligatorio.
        if parsed_expiry is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Este tipo de documento no tiene vigencia configurada; "
                    "debes indicar la fecha de vencimiento."
                ),
            )

    if parsed_expiry is not None and parsed_expiry < date.today():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Bloqueo del sistema: El documento ya se encuentra vencido. "
                f"Fecha de caducidad: {parsed_expiry.strftime('%d-%m-%Y')}. "
                f"No se permite su ingreso."
            ),
        )

    return parsed_issue, parsed_expiry


def recompute_edit_dates(
    issue_date_str: str | None,
    expiry_date_str: str | None,
    effective_validity_days: int | None,
    current_issue: date | None,
    current_expiry: date | None,
) -> tuple[date | None, date | None]:
    """Edición PARCIAL de fechas: aplica solo lo provisto (no exige fechas, para
    permitir editar otros campos sin reenviarlas). Con vigencia configurada, el
    vencimiento se recalcula desde la emisión (nueva o la ya guardada); sin
    vigencia, se toma el vencimiento manual si vino. 422 solo si el formato es
    inválido."""
    new_issue, new_expiry = _parse_iso_dates(issue_date_str, expiry_date_str)
    issue = new_issue if new_issue is not None else current_issue
    expiry = current_expiry
    if effective_validity_days:
        if issue is not None:
            expiry = issue + timedelta(days=effective_validity_days)
    elif new_expiry is not None:
        expiry = new_expiry
    return issue, expiry
