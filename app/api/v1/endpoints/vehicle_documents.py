import logging
import os
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from openai import APITimeoutError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import Module, PermissionLevel, require_module
from app.core.ratelimit import rate_limit_ai_scan
from app.db.session import get_db
from app.models.associations import DocumentStatus
from app.models.vehicle_document import VehicleDocument
from app.models.vehicle_document_type import VehicleDocumentType
from app.schemas.ai_validation import ValidationWarning
from app.schemas.vehicle_document import VehicleDocumentRead, VehicleDocumentReview
from app.services.ai_validation import Dimension, combine
from app.services.storage import (
    delete_file,
    read_upload_capped,
    resolve_media_type,
    save_vehicle_upload,
    validate_upload_head,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/vehicle-documents", tags=["vehicle-documents"])

_R = [Depends(require_module(Module.vehiculos, PermissionLevel.read))]
_W = [Depends(require_module(Module.vehiculos, PermissionLevel.write))]


@router.post("/ai-scan", dependencies=[*_W, Depends(rate_limit_ai_scan)])
async def ai_scan_vehicle_document(
    file: UploadFile = File(...),
    vehicle_document_type_id: int | None = Form(None),
    db: AsyncSession = Depends(get_db),
):
    """Preview scan: extract dates and doc type without blocking validation."""
    from app.core.config import settings
    from app.services.vehicle_ai_extractor import extract_and_validate

    # Si se indica el tipo y tiene la validación de IA apagada, se SALTA la IA
    # por completo (ni se llama a OpenAI): el usuario ingresará las fechas a mano.
    expected_type_name: str | None = None
    if vehicle_document_type_id is not None:
        vdt = await db.get(VehicleDocumentType, vehicle_document_type_id)
        if vdt is not None and not vdt.ai_validation_enabled:
            return {
                "issue_date": None,
                "expiry_date": None,
                "document_type_detected": None,
                "ai_validation_enabled": False,
                "match_confidence": "not_found",
                "validation_action": "silent",
                "warnings": [],
                "conflict": None,
            }
        expected_type_name = vdt.name if vdt else None

    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="Servicio de IA no configurado.")

    # Aplica el límite de tamaño ANTES de enviar nada a OpenAI.
    content = await read_upload_capped(file)
    try:
        result = await extract_and_validate(
            content, file.content_type or "", file.filename or "", expected_type_name
        )
    except APITimeoutError:
        raise HTTPException(status_code=504, detail="El análisis del documento tardó demasiado.")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("Fallo al contactar OpenAI en ai-scan de vehicle document")
        raise HTTPException(
            status_code=502,
            detail="El servicio de análisis no está disponible, intenta más tarde.",
        )

    # Preview del veredicto de tipo (vehículos no tienen identidad).
    verdict = combine([
        Dimension(
            key="type", verdict=result["match_confidence"],
            reasoning=result.get("type_reasoning"),
            expected=expected_type_name, detected=result.get("detected_document_name"),
        ),
    ])

    return {
        "issue_date": result["issue_date"],
        "expiry_date": result["expiry_date"],
        "document_type_detected": result["document_type_detected"],
        "ai_validation_enabled": True,
        "match_confidence": result["match_confidence"],
        "type_reasoning": result.get("type_reasoning"),
        "detected_document_name": result.get("detected_document_name"),
        "validation_action": verdict.action,
        "warnings": verdict.warnings,
        "conflict": verdict.conflict,
    }


@router.post(
    "/", response_model=VehicleDocumentRead, status_code=status.HTTP_201_CREATED, dependencies=_W
)
async def upload_vehicle_document(
    vehicle_id: int = Form(...),
    vehicle_document_type_id: int = Form(...),
    issue_date: str | None = Form(None, description="Fecha emisión YYYY-MM-DD"),
    expiry_date: str | None = Form(None, description="Fecha vencimiento YYYY-MM-DD"),
    force_validation_override: bool = Form(
        False, description="Reenviar tras un 409 para saltar el conflicto de tipo"
    ),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    from datetime import date as date_type

    from app.core.config import settings

    # --- Validate file type (whitelist + magic bytes) BEFORE any AI/processing ---
    # Lee solo el primer chunk; save_vehicle_upload revalida y hace streaming.
    await validate_upload_head(file)

    vdt = await db.get(VehicleDocumentType, vehicle_document_type_id)
    if not vdt or not vdt.is_active:
        raise HTTPException(status_code=404, detail="Tipo de documento no encontrado.")

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

    # ── AI validation: Escudo de Tipo (silencio/aviso/409) + Escudo de Vigencia ──
    # Solo si el tipo tiene la validación de IA activada; si no, se salta (manual).
    type_override_used = False
    validation_notes: str | None = None
    warnings: list[dict] = []
    if settings.OPENAI_API_KEY and vdt.ai_validation_enabled:
        from app.services.vehicle_ai_extractor import extract_and_validate

        # Aplica el límite de tamaño ANTES de enviar nada a OpenAI.
        content = await read_upload_capped(file)
        try:
            ai = await extract_and_validate(
                content, file.content_type or "", file.filename or "", vdt.name
            )
        except APITimeoutError:
            raise HTTPException(
                status_code=504, detail="El análisis del documento tardó demasiado."
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        except Exception:
            logger.exception("Fallo al contactar OpenAI al subir vehicle document")
            raise HTTPException(
                status_code=502,
                detail="El servicio de análisis no está disponible, intenta más tarde.",
            )

        # Escudo de Tipo — combinado (solo tipo; vehículos no tienen identidad).
        verdict = combine([
            Dimension(
                key="type", verdict=ai["match_confidence"],
                reasoning=ai.get("type_reasoning"),
                expected=vdt.name, detected=ai.get("detected_document_name"),
            ),
        ])
        validation_notes = verdict.notes
        warnings = verdict.warnings
        if verdict.action == "conflict":
            if not force_validation_override:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "message": "El documento no coincide con el tipo esperado. "
                        "Revísalo o confirma para subir de todas formas.",
                        **verdict.conflict,
                    },
                )
            type_override_used = True

        # Escudo de Vigencia (bloqueo duro; NO lo cubre el override de tipo)
        ai_expiry_str = ai.get("expiry_date")
        if ai_expiry_str:
            try:
                ai_expiry = date.fromisoformat(ai_expiry_str)
                if ai_expiry < date_type.today():
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"El documento que intentas subir ya se encuentra vencido "
                            f"(Fecha: {ai_expiry_str})."
                        ),
                    )
                if parsed_expiry is None:
                    parsed_expiry = ai_expiry
            except ValueError:
                pass

        if parsed_issue is None and ai.get("issue_date"):
            try:
                parsed_issue = date.fromisoformat(ai["issue_date"])
            except ValueError:
                pass

        # Devolver el puntero del archivo al inicio para que storage lo lea
        await file.seek(0)

    # ── Persistencia ──────────────────────────────────────────────────────────
    file_path, mime_type, file_size = await save_vehicle_upload(
        file, vehicle_id, vehicle_document_type_id
    )

    doc = VehicleDocument(
        vehicle_id=vehicle_id,
        vehicle_document_type_id=vehicle_document_type_id,
        file_path=file_path,
        original_filename=file.filename or "sin_nombre",
        mime_type=mime_type,
        file_size_bytes=file_size,
        upload_date=datetime.now(timezone.utc),
        issue_date=parsed_issue,
        expiry_date=parsed_expiry,
        status=DocumentStatus.APPROVED,
        type_override_used=type_override_used,
        validation_notes=validation_notes,
    )
    db.add(doc)
    try:
        await db.commit()
    except Exception:
        # El archivo ya está en disco: si el commit falla, evitamos el huérfano.
        await db.rollback()
        delete_file(file_path)
        raise

    refreshed = await db.execute(
        select(VehicleDocument)
        .where(VehicleDocument.id == doc.id)
        .options(selectinload(VehicleDocument.vehicle_document_type))
    )
    response = VehicleDocumentRead.model_validate(refreshed.scalar_one())
    response.warnings = [ValidationWarning(**w) for w in warnings]
    return response


@router.get("/{doc_id}/view", dependencies=_R)
async def view_vehicle_document(doc_id: int, db: AsyncSession = Depends(get_db)):
    doc = await db.get(VehicleDocument, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado.")
    if not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="Archivo no encontrado en el servidor.")
    # media_type SIEMPRE desde nuestro mapa validado. Inline solo si el tipo
    # está en la lista blanca; ante cualquier duda, forzar descarga.
    media_type = resolve_media_type(doc.mime_type, doc.original_filename)
    if media_type is None:
        media_type = "application/octet-stream"
        disposition = "attachment"
    else:
        disposition = "inline"
    return FileResponse(
        path=doc.file_path,
        media_type=media_type,
        filename=doc.original_filename,
        content_disposition_type=disposition,
        headers={"X-Content-Type-Options": "nosniff"},
    )


@router.get("/{doc_id}/download", dependencies=_R)
async def download_vehicle_document(doc_id: int, db: AsyncSession = Depends(get_db)):
    doc = await db.get(VehicleDocument, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado.")
    if not os.path.exists(doc.file_path):
        raise HTTPException(status_code=404, detail="Archivo no encontrado en el servidor.")
    media_type = (
        resolve_media_type(doc.mime_type, doc.original_filename) or "application/octet-stream"
    )
    return FileResponse(
        path=doc.file_path,
        media_type=media_type,
        filename=doc.original_filename,
        content_disposition_type="attachment",
        headers={"X-Content-Type-Options": "nosniff"},
    )


@router.get("/{doc_id}", response_model=VehicleDocumentRead, dependencies=_R)
async def get_vehicle_document(doc_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(VehicleDocument)
        .where(VehicleDocument.id == doc_id)
        .options(selectinload(VehicleDocument.vehicle_document_type))
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado.")
    return doc


@router.patch("/{doc_id}", response_model=VehicleDocumentRead, dependencies=_W)
async def edit_vehicle_document(
    doc_id: int,
    issue_date: str | None = Form(None, description="Fecha emisión YYYY-MM-DD"),
    expiry_date: str | None = Form(None, description="Fecha vencimiento YYYY-MM-DD"),
    custom_alert_days: int | None = Form(None),
    force_validation_override: bool = Form(
        False, description="Reenviar tras un 409 para saltar el conflicto de tipo"
    ),
    file: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(VehicleDocument)
        .where(VehicleDocument.id == doc_id)
        .options(selectinload(VehicleDocument.vehicle_document_type))
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado.")

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

    old_path: str | None = None
    new_path: str | None = None
    if file is not None:
        # Validate replacement file early (whitelist + magic bytes) before AI.
        await validate_upload_head(file)

        # ── AI validation (Escudo de Tipo + Escudo de Vigencia) ──────────────
        from app.core.config import settings

        # Solo si el tipo tiene la validación de IA activada; si no, se salta.
        if settings.OPENAI_API_KEY and doc.vehicle_document_type.ai_validation_enabled:
            from app.services.vehicle_ai_extractor import extract_and_validate

            # Aplica el límite de tamaño ANTES de enviar nada a OpenAI.
            content = await read_upload_capped(file)
            try:
                ai = await extract_and_validate(
                    content,
                    file.content_type or "",
                    file.filename or "",
                    doc.vehicle_document_type.name,
                )
            except APITimeoutError:
                raise HTTPException(
                    status_code=504, detail="El análisis del documento tardó demasiado."
                )
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc))
            except Exception:
                logger.exception("Fallo al contactar OpenAI al editar vehicle document")
                raise HTTPException(
                    status_code=502,
                    detail="El servicio de análisis no está disponible, intenta más tarde.",
                )

            # Escudo de Tipo — combinado (solo tipo). Silencio / aviso / 409.
            verdict = combine([
                Dimension(
                    key="type", verdict=ai["match_confidence"],
                    reasoning=ai.get("type_reasoning"),
                    expected=doc.vehicle_document_type.name,
                    detected=ai.get("detected_document_name"),
                ),
            ])
            doc.validation_notes = verdict.notes
            if verdict.action == "conflict":
                if not force_validation_override:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail={
                            "message": "El documento no coincide con el tipo esperado. "
                            "Revísalo o confirma para subir de todas formas.",
                            **verdict.conflict,
                        },
                    )
                doc.type_override_used = True

            # Escudo de Vigencia
            ai_expiry_str = ai.get("expiry_date")
            if ai_expiry_str:
                try:
                    ai_expiry = date.fromisoformat(ai_expiry_str)
                    if ai_expiry < date.today():
                        raise HTTPException(
                            status_code=400,
                            detail=(
                                f"El documento que intentas subir ya se encuentra vencido "
                                f"(Fecha: {ai_expiry_str})."
                            ),
                        )
                    if parsed_expiry is None:
                        parsed_expiry = ai_expiry
                except ValueError:
                    pass

            if parsed_issue is None and ai.get("issue_date"):
                try:
                    parsed_issue = date.fromisoformat(ai["issue_date"])
                except ValueError:
                    pass

            await file.seek(0)

        old_path = doc.file_path
        new_path, mime_type, file_size = await save_vehicle_upload(
            file, doc.vehicle_id, doc.vehicle_document_type_id
        )
        doc.file_path = new_path
        doc.original_filename = file.filename or "sin_nombre"
        doc.mime_type = mime_type
        doc.file_size_bytes = file_size
        doc.upload_date = datetime.now(timezone.utc)
        doc.status = DocumentStatus.APPROVED

    if parsed_issue is not None:
        doc.issue_date = parsed_issue
    if parsed_expiry is not None:
        doc.expiry_date = parsed_expiry
    if custom_alert_days is not None:
        doc.custom_alert_days = custom_alert_days if custom_alert_days > 0 else None

    # Migrate any legacy UPLOADED/PENDING documents to APPROVED on edit
    # (review workflow was removed — any persisted document is considered valid)
    if doc.status != DocumentStatus.REJECTED:
        doc.status = DocumentStatus.APPROVED

    try:
        await db.commit()
    except Exception:
        await db.rollback()
        delete_file(new_path)  # archivo nuevo recién escrito → evitar huérfano
        raise
    # Commit OK: si reemplazamos el archivo, el anterior queda huérfano.
    if new_path and old_path and old_path != new_path:
        delete_file(old_path)

    refreshed = await db.execute(
        select(VehicleDocument)
        .where(VehicleDocument.id == doc_id)
        .options(selectinload(VehicleDocument.vehicle_document_type))
    )
    return refreshed.scalar_one()


@router.patch("/{doc_id}/review", response_model=VehicleDocumentRead, dependencies=_W)
async def review_vehicle_document(
    doc_id: int, payload: VehicleDocumentReview, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(VehicleDocument)
        .where(VehicleDocument.id == doc_id)
        .options(selectinload(VehicleDocument.vehicle_document_type))
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado.")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(doc, field, value)
    await db.commit()

    refreshed = await db.execute(
        select(VehicleDocument)
        .where(VehicleDocument.id == doc_id)
        .options(selectinload(VehicleDocument.vehicle_document_type))
    )
    return refreshed.scalar_one()
