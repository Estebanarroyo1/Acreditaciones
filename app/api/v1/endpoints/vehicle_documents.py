import os
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from openai import APITimeoutError

from app.core.permissions import Module, PermissionLevel, require_module
from app.core.ratelimit import rate_limit_ai_scan
from app.db.session import get_db
from app.models.associations import DocumentStatus
from app.models.vehicle_document import VehicleDocument
from app.models.vehicle_document_type import VehicleDocumentType
from app.schemas.vehicle_document import VehicleDocumentRead, VehicleDocumentReview
from app.services.storage import (
    read_upload_capped,
    resolve_media_type,
    save_vehicle_upload,
    validate_upload_head,
)

router = APIRouter(prefix="/vehicle-documents", tags=["vehicle-documents"])

_R = [Depends(require_module(Module.vehiculos, PermissionLevel.read))]
_W = [Depends(require_module(Module.vehiculos, PermissionLevel.write))]


@router.post("/ai-scan", dependencies=[*_W, Depends(rate_limit_ai_scan)])
async def ai_scan_vehicle_document(file: UploadFile = File(...)):
    """Preview scan: extract dates and doc type without blocking validation."""
    from app.core.config import settings
    from app.services.vehicle_ai_extractor import extract_and_validate

    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="Servicio de IA no configurado.")

    # Aplica el límite de tamaño ANTES de enviar nada a OpenAI.
    content = await read_upload_capped(file)
    try:
        result = await extract_and_validate(
            content, file.content_type or "", file.filename or ""
        )
    except APITimeoutError:
        raise HTTPException(status_code=504, detail="El análisis del documento tardó demasiado.")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Error al contactar OpenAI: {exc}")

    return {
        "issue_date": result["issue_date"],
        "expiry_date": result["expiry_date"],
        "document_type_detected": result["document_type_detected"],
    }


@router.post("/", response_model=VehicleDocumentRead, status_code=status.HTTP_201_CREATED, dependencies=_W)
async def upload_vehicle_document(
    vehicle_id: int = Form(...),
    vehicle_document_type_id: int = Form(...),
    issue_date: str | None = Form(None, description="Fecha emisión YYYY-MM-DD"),
    expiry_date: str | None = Form(None, description="Fecha vencimiento YYYY-MM-DD"),
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

    # ── AI validation (Escudo de Tipo + Escudo de Vigencia) ──────────────────
    if settings.OPENAI_API_KEY:
        from app.services.vehicle_ai_extractor import extract_and_validate

        # Aplica el límite de tamaño ANTES de enviar nada a OpenAI.
        content = await read_upload_capped(file)
        try:
            ai = await extract_and_validate(
                content, file.content_type or "", file.filename or "", vdt.name
            )
        except APITimeoutError:
            raise HTTPException(status_code=504, detail="El análisis del documento tardó demasiado.")
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Error al contactar OpenAI: {exc}")

        # Escudo de Tipo
        if not ai["is_expected_document"]:
            detected = ai.get("detected_document_name") or "un documento desconocido"
            raise HTTPException(
                status_code=400,
                detail=(
                    f"El documento no coincide. "
                    f"Se esperaba un {vdt.name} pero el sistema detectó {detected}."
                ),
            )

        # Escudo de Vigencia
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
    )
    db.add(doc)
    await db.commit()

    refreshed = await db.execute(
        select(VehicleDocument)
        .where(VehicleDocument.id == doc.id)
        .options(selectinload(VehicleDocument.vehicle_document_type))
    )
    return refreshed.scalar_one()


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
    media_type = resolve_media_type(doc.mime_type, doc.original_filename) or "application/octet-stream"
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

    if file is not None:
        # Validate replacement file early (whitelist + magic bytes) before AI.
        await validate_upload_head(file)

        # ── AI validation (Escudo de Tipo + Escudo de Vigencia) ──────────────
        from app.core.config import settings

        if settings.OPENAI_API_KEY:
            from app.services.vehicle_ai_extractor import extract_and_validate

            # Aplica el límite de tamaño ANTES de enviar nada a OpenAI.
            content = await read_upload_capped(file)
            try:
                ai = await extract_and_validate(
                    content, file.content_type or "", file.filename or "",
                    doc.vehicle_document_type.name,
                )
            except APITimeoutError:
                raise HTTPException(status_code=504, detail="El análisis del documento tardó demasiado.")
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc))
            except Exception as exc:
                raise HTTPException(status_code=502, detail=f"Error al contactar OpenAI: {exc}")

            # Escudo de Tipo
            if not ai["is_expected_document"]:
                detected = ai.get("detected_document_name") or "un documento desconocido"
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"El documento no coincide. Se esperaba un "
                        f"{doc.vehicle_document_type.name} pero el sistema detectó {detected}."
                    ),
                )

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

    await db.commit()

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
