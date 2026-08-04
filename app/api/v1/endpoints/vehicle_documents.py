import logging
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import Module, PermissionLevel, require_module
from app.db.session import get_db
from app.models.associations import DocumentStatus
from app.models.vehicle_document import VehicleDocument
from app.models.vehicle_document_type import VehicleDocumentType
from app.schemas.vehicle_document import VehicleDocumentRead, VehicleDocumentReview
from app.services.storage import (
    delete_file,
    resolve_media_type,
    save_vehicle_upload,
    validate_upload_head,
)
from app.services.worker_documents import recompute_edit_dates, resolve_document_dates

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/vehicle-documents", tags=["vehicle-documents"])

_R = [Depends(require_module(Module.vehiculos, PermissionLevel.read))]
_W = [Depends(require_module(Module.vehiculos, PermissionLevel.write))]


@router.post(
    "/", response_model=VehicleDocumentRead, status_code=status.HTTP_201_CREATED, dependencies=_W
)
async def upload_vehicle_document(
    vehicle_id: int = Form(...),
    vehicle_document_type_id: int = Form(...),
    issue_date: str | None = Form(None, description="Fecha emisión YYYY-MM-DD"),
    expiry_date: str | None = Form(None, description="Fecha vencimiento YYYY-MM-DD"),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    # --- Validate file type (whitelist + magic bytes) antes de tocar el disco ---
    # Lee solo el primer chunk; save_vehicle_upload revalida y hace streaming.
    await validate_upload_head(file)

    vdt = await db.get(VehicleDocumentType, vehicle_document_type_id)
    if not vdt or not vdt.is_active:
        raise HTTPException(status_code=404, detail="Tipo de documento no encontrado.")

    # Resolución de fechas: manual + cálculo por validity_days (sin IA). Incluye el
    # Escudo de Vigencia (400 si ya está vencido).
    parsed_issue, parsed_expiry = resolve_document_dates(issue_date, expiry_date, vdt.validity_days)

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

    validity_days = doc.vehicle_document_type.validity_days if doc.vehicle_document_type else None
    # Edición parcial de fechas (manual + recálculo por validity_days, sin IA).
    doc.issue_date, doc.expiry_date = recompute_edit_dates(
        issue_date, expiry_date, validity_days, doc.issue_date, doc.expiry_date
    )

    old_path: str | None = None
    new_path: str | None = None
    if file is not None:
        # Validate replacement file early (whitelist + magic bytes) antes de guardar.
        await validate_upload_head(file)
        old_path = doc.file_path
        new_path, mime_type, file_size = await save_vehicle_upload(
            file, doc.vehicle_id, doc.vehicle_document_type_id
        )
        doc.file_path = new_path
        doc.original_filename = file.filename or "sin_nombre"
        doc.mime_type = mime_type
        doc.file_size_bytes = file_size
        doc.upload_date = datetime.now(timezone.utc)

    if custom_alert_days is not None:
        doc.custom_alert_days = custom_alert_days if custom_alert_days > 0 else None

    # El flujo de revisión se removió: cualquier documento persistido se considera válido.
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
