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
from app.models.associations import (
    DocumentStatus,
    ProjectDocumentType,
    WorkerDocument,
    WorkerProject,
)
from app.models.document_type import DocumentType
from app.schemas.worker_document import WorkerDocumentRead, WorkerDocumentUpdate
from app.services.storage import (
    delete_file,
    resolve_media_type,
    save_upload,
    validate_upload_head,
)
from app.services.worker_documents import recompute_edit_dates, resolve_document_dates

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/worker-documents", tags=["worker-documents"])

_R = [Depends(require_module(Module.trabajadores, PermissionLevel.read))]
_W = [Depends(require_module(Module.trabajadores, PermissionLevel.write))]


@router.post(
    "/",
    response_model=WorkerDocumentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Subir documento de acreditación (carga manual)",
    dependencies=_W,
)
async def upload_document(
    worker_id: int = Form(...),
    project_id: int | None = Form(None),
    document_type_id: int = Form(...),
    issue_date: str | None = Form(None, description="Fecha de emisión YYYY-MM-DD"),
    expiry_date: str | None = Form(None, description="Fecha de vencimiento YYYY-MM-DD"),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    # --- Validate file type (whitelist + magic bytes) antes de tocar el disco ---
    # Lee solo el primer chunk; save_upload revalida y hace streaming como defensa.
    await validate_upload_head(file)

    # --- Load and validate document type ---
    dt_result = await db.execute(
        select(DocumentType).where(
            DocumentType.id == document_type_id,
            DocumentType.is_active == True,
        )
    )
    doc_type = dt_result.scalar_one_or_none()
    if not doc_type:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Tipo de documento no encontrado o inactivo.",
        )
    is_global = doc_type.is_global_base_requirement

    if project_id is None:
        # Global-only upload: doc type must be a global base requirement
        if not is_global:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Solo se puede subir sin proyecto documentos de requisito global.",
            )
    else:
        # Project-scoped upload: validate worker↔project assignment
        assignment = await db.execute(
            select(WorkerProject).where(
                WorkerProject.worker_id == worker_id,
                WorkerProject.project_id == project_id,
                WorkerProject.is_active == True,
            )
        )
        if not assignment.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="El trabajador no está asignado a este proyecto.",
            )
        if not is_global:
            requirement = await db.execute(
                select(ProjectDocumentType).where(
                    ProjectDocumentType.project_id == project_id,
                    ProjectDocumentType.document_type_id == document_type_id,
                )
            )
            if not requirement.scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Ese tipo de documento no es requerido por el proyecto.",
                )

    # --- Resolución de fechas: manual + cálculo por validity_days (sin IA) ---
    parsed_issue, parsed_expiry = resolve_document_dates(
        issue_date, expiry_date, doc_type.effective_validity_days
    )

    # --- Persist the file ---
    file_path, mime_type, file_size = await save_upload(
        file, project_id, worker_id, document_type_id
    )

    # --- Create DB record (columnas de auditoría de validación quedan en default) ---
    doc = WorkerDocument(
        worker_id=worker_id,
        project_id=project_id,
        document_type_id=document_type_id,
        file_path=file_path,
        original_filename=file.filename or "sin_nombre",
        mime_type=mime_type,
        file_size_bytes=file_size,
        upload_date=datetime.now(timezone.utc),
        issue_date=parsed_issue,
        expiry_date=parsed_expiry,
        status=DocumentStatus.PENDING,
    )
    db.add(doc)
    try:
        await db.commit()
    except Exception:
        # El archivo ya está en disco: si el commit falla, evitamos el huérfano.
        await db.rollback()
        delete_file(file_path)
        raise

    # Reload with relationship for the response schema
    refreshed = await db.execute(
        select(WorkerDocument)
        .where(WorkerDocument.id == doc.id)
        .options(selectinload(WorkerDocument.document_type))
    )
    return refreshed.scalar_one()


@router.get("/{doc_id}/view", dependencies=_R)
async def view_document(doc_id: int, db: AsyncSession = Depends(get_db)):
    doc = await db.get(WorkerDocument, doc_id)
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
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/{doc_id}/download", dependencies=_R)
async def download_document(doc_id: int, db: AsyncSession = Depends(get_db)):
    doc = await db.get(WorkerDocument, doc_id)
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


@router.get("/{doc_id}", response_model=WorkerDocumentRead, dependencies=_R)
async def get_document(doc_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(WorkerDocument)
        .where(WorkerDocument.id == doc_id)
        .options(selectinload(WorkerDocument.document_type))
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado.")
    return doc


@router.patch(
    "/{doc_id}",
    response_model=WorkerDocumentRead,
    summary="Editar fechas y/o reemplazar archivo (carga manual)",
    dependencies=_W,
)
async def edit_document(
    doc_id: int,
    issue_date: str | None = Form(None, description="Fecha de emisión YYYY-MM-DD"),
    expiry_date: str | None = Form(None, description="Fecha de vencimiento YYYY-MM-DD"),
    custom_alert_percentage: int | None = Form(
        None, description="% de vida útil para alerta (1-100). None = hereda del tipo o global"
    ),
    file: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WorkerDocument)
        .where(WorkerDocument.id == doc_id)
        .options(selectinload(WorkerDocument.document_type))
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado.")

    # Validate replacement file early (whitelist + magic bytes) antes de procesar.
    if file is not None:
        await validate_upload_head(file)

    effective_vd = doc.document_type.effective_validity_days if doc.document_type else None
    # Edición parcial de fechas (manual + recálculo por validity_days, sin IA).
    doc.issue_date, doc.expiry_date = recompute_edit_dates(
        issue_date, expiry_date, effective_vd, doc.issue_date, doc.expiry_date
    )

    old_path: str | None = None
    new_path: str | None = None
    if file is not None:
        # Replace the stored file and reset status to pending review
        old_path = doc.file_path
        new_path, mime_type, file_size = await save_upload(
            file, doc.project_id, doc.worker_id, doc.document_type_id
        )
        doc.file_path = new_path
        doc.original_filename = file.filename or "sin_nombre"
        doc.mime_type = mime_type
        doc.file_size_bytes = file_size
        doc.upload_date = datetime.now(timezone.utc)
        doc.status = DocumentStatus.PENDING

    if custom_alert_percentage is not None:
        # 0 = explicit clear; 1-100 = set override
        doc.custom_alert_percentage = (
            custom_alert_percentage if custom_alert_percentage > 0 else None
        )

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
        select(WorkerDocument)
        .where(WorkerDocument.id == doc_id)
        .options(selectinload(WorkerDocument.document_type))
    )
    return refreshed.scalar_one()


@router.post(
    "/{doc_id}/archive",
    status_code=status.HTTP_200_OK,
    summary="Archivar documento (soft-archive: excluye de acreditación activa)",
    dependencies=_W,
)
async def archive_worker_document(doc_id: int, db: AsyncSession = Depends(get_db)):
    doc = await db.get(WorkerDocument, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado.")
    doc.is_archived = True
    await db.commit()
    return {"ok": True}


@router.patch(
    "/{doc_id}/review",
    response_model=WorkerDocumentRead,
    summary="Aprobar o rechazar un documento (revisor)",
    dependencies=_W,
)
async def review_document(
    doc_id: int,
    payload: WorkerDocumentUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WorkerDocument)
        .where(WorkerDocument.id == doc_id)
        .options(selectinload(WorkerDocument.document_type))
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado.")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(doc, field, value)
    await db.commit()
    await db.refresh(doc)

    # Re-fetch with relationship after refresh
    refreshed = await db.execute(
        select(WorkerDocument)
        .where(WorkerDocument.id == doc_id)
        .options(selectinload(WorkerDocument.document_type))
    )
    return refreshed.scalar_one()
