import logging
import os
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from openai import APITimeoutError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.permissions import Module, PermissionLevel, require_module
from app.core.ratelimit import rate_limit_ai_scan
from app.db.session import get_db
from app.models.associations import (
    DocumentStatus,
    ProjectDocumentType,
    WorkerDocument,
    WorkerProject,
)
from app.models.document_type import DocumentType
from app.models.worker import Worker
from app.schemas.ai_validation import ValidationWarning
from app.schemas.worker_document import WorkerDocumentRead, WorkerDocumentUpdate
from app.services.ai_validation import Dimension, combine
from app.services.storage import (
    delete_file,
    read_upload_capped,
    resolve_media_type,
    save_upload,
    validate_upload_head,
)
from app.services.worker_documents import resolve_document_dates

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/worker-documents", tags=["worker-documents"])

_R = [Depends(require_module(Module.trabajadores, PermissionLevel.read))]
_W = [Depends(require_module(Module.trabajadores, PermissionLevel.write))]


@router.post(
    "/ai-scan",
    summary="Analizar documento con IA y extraer fechas (sin guardar)",
    dependencies=[*_W, Depends(rate_limit_ai_scan)],
)
async def ai_scan_worker_document(
    file: UploadFile = File(...),
    validity_days: int | None = Form(None),
    document_type_id: int | None = Form(None),
    worker_id: int | None = Form(None),
    db: AsyncSession = Depends(get_db),
):
    from app.core.config import settings
    from app.services.worker_ai_extractor import extract_dates

    # Contexto esperado para los veredictos: nombre del tipo y del titular (BD).
    expected_type_name: str | None = None
    if document_type_id is not None:
        doc_type = await db.get(DocumentType, document_type_id)
        # Si el tipo tiene la validación de IA apagada, se SALTA la IA por completo.
        if doc_type is not None and not doc_type.ai_validation_enabled:
            return {
                "issue_date": None,
                "expiry_date": None,
                "expiry_computed": False,
                "document_type_detected": None,
                "ai_validation_enabled": False,
                "match_confidence": "not_found",
                "person_match": "not_found",
                "validation_action": "silent",
                "warnings": [],
                "conflict": None,
            }
        expected_type_name = doc_type.name if doc_type else None

    expected_person_name: str | None = None
    if worker_id is not None:
        worker = await db.get(Worker, worker_id)
        expected_person_name = (
            f"{worker.first_name} {worker.last_name}".strip() if worker else None
        )

    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="Servicio de IA no configurado.")

    # Aplica el límite de tamaño ANTES de enviar nada a OpenAI.
    content = await read_upload_capped(file)
    try:
        result = await extract_dates(
            content,
            file.content_type or "",
            file.filename or "",
            expected_type_name,
            expected_person_name,
        )
    except APITimeoutError:
        raise HTTPException(status_code=504, detail="El análisis del documento tardó demasiado.")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        logger.exception("Fallo al contactar OpenAI en ai-scan de worker document")
        raise HTTPException(
            status_code=502,
            detail="El servicio de análisis no está disponible, intenta más tarde.",
        )

    # When validity_days is configured, ALWAYS compute expiry from issue_date + validity_days.
    # The document text might say "valid 2 years" but the system config takes precedence.
    # expiry_computed=True signals the frontend to show a suggestion strip (not auto-fill).
    expiry_computed = False
    if validity_days and result.get("issue_date"):
        try:
            issue = date.fromisoformat(result["issue_date"])
            result["expiry_date"] = (issue + timedelta(days=validity_days)).isoformat()
            expiry_computed = True
        except ValueError:
            pass

    # Preview de veredictos combinados (tipo + identidad) para que el frontend
    # muestre avisos/conflicto ANTES de subir.
    verdict = combine([
        Dimension(
            key="type", verdict=result["match_confidence"],
            reasoning=result.get("type_reasoning"),
            expected=expected_type_name, detected=result.get("document_type_detected"),
        ),
        Dimension(
            key="identity", verdict=result["person_match"],
            reasoning=result.get("identity_reasoning"),
            expected=expected_person_name, detected=result.get("person_name_detected"),
        ),
    ])

    return {
        "issue_date": result["issue_date"],
        "expiry_date": result["expiry_date"],
        "expiry_computed": expiry_computed,
        "document_type_detected": result["document_type_detected"],
        "ai_validation_enabled": True,
        "match_confidence": result["match_confidence"],
        "type_reasoning": result.get("type_reasoning"),
        "person_match": result["person_match"],
        "person_name_detected": result.get("person_name_detected"),
        "identity_reasoning": result.get("identity_reasoning"),
        "validation_action": verdict.action,
        "warnings": verdict.warnings,
        "conflict": verdict.conflict,
    }


@router.post(
    "/",
    response_model=WorkerDocumentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Subir documento de acreditación",
    dependencies=_W,
)
async def upload_document(
    worker_id: int = Form(...),
    project_id: int | None = Form(None),
    document_type_id: int = Form(...),
    issue_date: str | None = Form(None, description="Fecha de emisión YYYY-MM-DD"),
    expiry_date: str | None = Form(None, description="Fecha de vencimiento YYYY-MM-DD"),
    force_validation_override: bool = Form(
        False, description="Reenviar tras un 409 para saltar el conflicto de tipo/identidad"
    ),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    # --- Validate file type (whitelist + magic bytes) BEFORE any AI/processing ---
    # Lee solo el primer chunk (no carga el archivo entero en RAM). save_upload
    # revalida y hace streaming a disco como defensa en profundidad.
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

    # --- Nombre del titular esperado: SIEMPRE desde la BD (worker_id), nunca del
    #     cliente. Se usa para que la IA verifique que el documento es de esa persona.
    worker = await db.get(Worker, worker_id)
    expected_person_name = (
        f"{worker.first_name} {worker.last_name}".strip() if worker else None
    )

    # --- Date resolution: parse + AI fill + validity fallback + expired check ---
    # Si el tipo tiene la validación de IA apagada, se salta la IA (fechas manuales).
    parsed_issue, parsed_expiry, ai_result = await resolve_document_dates(
        issue_date,
        expiry_date,
        file,
        doc_type.name,
        doc_type.effective_validity_days,
        ai_enabled=doc_type.ai_validation_enabled,
        expected_person_name=expected_person_name,
    )

    # --- Combinar veredictos IA (TIPO + IDENTIDAD): silencio / aviso / confirmación ---
    dimensions: list[Dimension] = []
    if ai_result is not None:
        dimensions.append(
            Dimension(
                key="type",
                verdict=ai_result.get("match_confidence", "not_found"),
                reasoning=ai_result.get("type_reasoning"),
                expected=doc_type.name,
                detected=ai_result.get("document_type_detected"),
            )
        )
        dimensions.append(
            Dimension(
                key="identity",
                verdict=ai_result.get("person_match", "not_found"),
                reasoning=ai_result.get("identity_reasoning"),
                expected=expected_person_name,
                detected=ai_result.get("person_name_detected"),
            )
        )
    verdict = combine(dimensions)

    override_used = False
    if verdict.action == "conflict":
        if not force_validation_override:
            # NO se guarda: 409 con el detalle de CADA problema + flag de reintento.
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": "El documento no superó la validación de IA. "
                    "Revisa los problemas detectados o confirma para subir de todas formas.",
                    **verdict.conflict,
                },
            )
        override_used = True  # el usuario (con permiso de escritura) confirmó el override

    # --- Persist the file ---
    file_path, mime_type, file_size = await save_upload(
        file, project_id, worker_id, document_type_id
    )

    # --- Create DB record ---
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
        validation_override_used=override_used,
        validation_notes=verdict.notes,
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
    response = WorkerDocumentRead.model_validate(refreshed.scalar_one())
    response.warnings = [ValidationWarning(**w) for w in verdict.warnings]
    return response


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
    summary="Editar fecha de vencimiento y/o reemplazar archivo",
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

    # Validate replacement file early (whitelist + magic bytes) before AI/processing.
    if file is not None:
        await validate_upload_head(file)

    dt_name = doc.document_type.name if doc.document_type else None
    effective_vd = doc.document_type.effective_validity_days if doc.document_type else None
    ai_enabled = doc.document_type.ai_validation_enabled if doc.document_type else True
    # Nombre del titular esperado desde la BD (dueño del documento), no del cliente.
    worker = await db.get(Worker, doc.worker_id)
    expected_person_name = (
        f"{worker.first_name} {worker.last_name}".strip() if worker else None
    )
    # La combinación de veredictos (409/aviso) aplica al flujo de SUBIDA; la edición
    # solo re-resuelve fechas (ignora ai_result).
    parsed_issue, parsed_expiry, _ai_result = await resolve_document_dates(
        issue_date, expiry_date, file, dt_name, effective_vd,
        ai_enabled=ai_enabled, expected_person_name=expected_person_name,
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

    if parsed_issue is not None:
        doc.issue_date = parsed_issue
    if parsed_expiry is not None:
        doc.expiry_date = parsed_expiry
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
