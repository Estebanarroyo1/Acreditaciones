import io
import os
import re
import zipfile
from datetime import datetime, timezone
from typing import Literal

import openpyxl
from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import StreamingResponse
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.pagination import Pagination, pagination_params, set_total_count
from app.core.permissions import Module, PermissionLevel, require_module
from app.db.session import get_db
from app.models.associations import DocumentStatus, WorkerDocument, WorkerProject
from app.models.project import Project
from app.models.worker import Worker, WorkLocation
from app.schemas.associations import WorkerProjectRead
from app.schemas.worker import BulkUploadResult, WorkerCreate, WorkerRead, WorkerUpdate
from app.schemas.worker_profile import WorkerFullProfile
from app.services.accreditation import (
    get_worker_base_requirements_gaps,
    get_workers_base_requirements_map,
)
from app.services.storage import delete_file
from app.services.worker_profile import get_worker_full_profile
from app.services.workers import process_bulk_upload

router = APIRouter(prefix="/workers", tags=["workers"])

_R = [Depends(require_module(Module.trabajadores, PermissionLevel.read))]
_W = [Depends(require_module(Module.trabajadores, PermissionLevel.write))]


def _sanitize_filename(name: str) -> str:
    """Reemplaza cualquier caracter fuera de [A-Za-z0-9_-] por '_'."""
    cleaned = re.sub(r"[^\w\-]+", "_", name, flags=re.UNICODE)
    return cleaned.strip("_") or "archivo"


@router.get("/", response_model=list[WorkerRead], dependencies=_R)
async def list_workers(
    response: Response,
    status: Literal["active", "archived"] = Query("active"),
    location: Literal["planta", "obra"] | None = Query(None),
    pagination: Pagination = Depends(pagination_params),
    db: AsyncSession = Depends(get_db),
):
    location_enum = (
        WorkLocation.PLANTA
        if location == "planta"
        else WorkLocation.OBRA
        if location == "obra"
        else None
    )
    base = select(Worker).where(Worker.is_active == (status == "active"))
    count_q = (
        select(func.count()).select_from(Worker).where(Worker.is_active == (status == "active"))
    )
    if location_enum is not None:
        base = base.where(Worker.work_location == location_enum)
        count_q = count_q.where(Worker.work_location == location_enum)

    total = await db.scalar(count_q)
    result = await db.execute(
        base.order_by(Worker.id).limit(pagination.limit).offset(pagination.offset)
    )
    workers = result.scalars().all()
    compliance = await get_workers_base_requirements_map(db)
    out = []
    for w in workers:
        item = WorkerRead.model_validate(w)
        item.meets_base_requirements = compliance.get(w.id, True)
        out.append(item)
    set_total_count(response, total or 0)
    return out


@router.post("/", response_model=WorkerRead, status_code=status.HTTP_201_CREATED, dependencies=_W)
async def create_worker(payload: WorkerCreate, db: AsyncSession = Depends(get_db)):
    worker = Worker(**payload.model_dump())
    db.add(worker)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un trabajador con ese DNI o email.",
        )
    await db.refresh(worker)
    return worker


@router.get("/{worker_id}/full-profile", response_model=WorkerFullProfile, dependencies=_R)
async def get_worker_full_profile_endpoint(worker_id: int, db: AsyncSession = Depends(get_db)):
    profile = await get_worker_full_profile(worker_id, db)
    if not profile:
        raise HTTPException(status_code=404, detail="Trabajador no encontrado.")
    return profile


@router.get(
    "/{worker_id}/documents/download-zip",
    summary="Descargar documentos del trabajador como ZIP",
    dependencies=_R,
)
async def download_worker_documents_zip(
    worker_id: int,
    scope: Literal["global", "project"] = Query(...),
    project_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    worker = await db.get(Worker, worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Trabajador no encontrado.")

    if scope == "project" and project_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Debe especificar project_id cuando scope=project.",
        )

    query = (
        select(WorkerDocument)
        .where(
            WorkerDocument.worker_id == worker_id,
            WorkerDocument.status != DocumentStatus.REJECTED,
        )
        .options(selectinload(WorkerDocument.document_type))
    )
    if scope == "global":
        query = query.where(WorkerDocument.project_id.is_(None))
        zip_label = "globales"
    else:
        query = query.where(WorkerDocument.project_id == project_id)
        zip_label = "proyecto"

    result = await db.execute(query)
    docs = result.scalars().all()
    if not docs:
        raise HTTPException(
            status_code=404,
            detail="No hay documentos disponibles para descargar con ese filtro.",
        )

    buffer = io.BytesIO()
    used_names: set[str] = set()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for doc in docs:
            if not os.path.exists(doc.file_path):
                continue
            type_name = doc.document_type.name if doc.document_type else "documento"
            base_name = f"{_sanitize_filename(type_name)}_{doc.original_filename}"
            arcname = base_name
            counter = 1
            while arcname in used_names:
                stem, ext = os.path.splitext(base_name)
                arcname = f"{stem}_{counter}{ext}"
                counter += 1
            used_names.add(arcname)
            zf.write(doc.file_path, arcname=arcname)

    if not used_names:
        raise HTTPException(
            status_code=404,
            detail="Los documentos filtrados no tienen archivos físicos disponibles en el servidor.",
        )

    buffer.seek(0)
    safe_worker_name = _sanitize_filename(f"{worker.first_name}_{worker.last_name}")
    filename = f"documentos_{zip_label}_{safe_worker_name}.zip"

    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/bulk-template", summary="Descargar plantilla Excel para carga masiva", dependencies=_R
)
async def download_bulk_template():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Trabajadores"

    headers = [
        "Nombre",
        "Apellido",
        "RUT_DNI",
        "Ubicacion",
        "Email",
        "Telefono",
        "Fecha_Nacimiento",
    ]
    required = {"Nombre", "Apellido", "RUT_DNI", "Ubicacion"}

    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    required_fill = PatternFill(start_color="1D4ED8", end_color="1D4ED8", fill_type="solid")
    hint_fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
    thin_border = Border(
        left=Side(style="thin", color="CBD5E1"),
        right=Side(style="thin", color="CBD5E1"),
        top=Side(style="thin", color="CBD5E1"),
        bottom=Side(style="thin", color="CBD5E1"),
    )

    for col_idx, header in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.font = Font(bold=True, color="FFFFFF", size=11)
        cell.fill = required_fill if header in required else header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = thin_border

    hints = [
        "ej: Carlos",
        "ej: Gomez",
        "ej: 12345678-9",
        "Planta o Obra",
        "ej: carlos@empresa.cl (opcional)",
        "ej: +56912345678 (opcional)",
        "DD/MM/AAAA (opcional)",
    ]
    for col_idx, hint in enumerate(hints, start=1):
        cell = ws.cell(row=2, column=col_idx, value=hint)
        cell.font = Font(italic=True, color="64748B", size=10)
        cell.fill = hint_fill
        cell.alignment = Alignment(horizontal="left", vertical="center")
        cell.border = thin_border

    col_widths = [18, 18, 18, 14, 30, 20, 20]
    for col_idx, width in enumerate(col_widths, start=1):
        ws.column_dimensions[openpyxl.utils.get_column_letter(col_idx)].width = width
    ws.row_dimensions[1].height = 22
    ws.row_dimensions[2].height = 18

    ws.freeze_panes = "A3"

    # Aplicar formato de fecha DD/MM/YYYY a la columna Fecha_Nacimiento (col 7).
    # openpyxl descarta el estilo de celdas vacías al serializar, por eso escribimos
    # una celda "marcadora" con valor None y luego la limpiamos: así el estilo queda
    # anclado en la celda y Excel lo aplica cuando el usuario escribe una fecha.
    for row in range(3, 501):
        c = ws.cell(row=row, column=7)
        c.number_format = "DD/MM/YYYY"
        c.value = None  # fuerza la creación del objeto Cell (sin valor visible)

    note_ws = wb.create_sheet("Instrucciones")
    instructions = [
        ("INSTRUCCIONES DE CARGA MASIVA", True),
        ("", False),
        ("1. Los campos Nombre, Apellido, RUT_DNI y Ubicacion son OBLIGATORIOS.", False),
        ("2. Ubication debe ser exactamente 'Planta' o 'Obra' (con mayúscula inicial).", False),
        (
            "3. La fila 2 de la hoja 'Trabajadores' es solo un ejemplo/guía — elimínela antes de subir.",
            False,
        ),
        ("4. El RUT/DNI debe ser único; filas con RUT duplicado serán ignoradas.", False),
        ("5. El formato de Fecha_Nacimiento es DD/MM/AAAA (ej: 15/03/1990).", False),
        (
            "6. Los datos comienzan desde la fila 3 en adelante (fila 1 = encabezados, fila 2 = guía).",
            False,
        ),
    ]
    for row_idx, (text, bold) in enumerate(instructions, start=1):
        cell = note_ws.cell(row=row_idx, column=1, value=text)
        if bold:
            cell.font = Font(bold=True, size=13, color="1E293B")
        else:
            cell.font = Font(size=11, color="334155")
    note_ws.column_dimensions["A"].width = 80

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="plantilla_trabajadores.xlsx"'},
    )


@router.post(
    "/bulk-upload",
    response_model=BulkUploadResult,
    summary="Carga masiva de trabajadores desde Excel (.xlsx)",
    dependencies=_W,
)
async def bulk_upload_workers(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El archivo debe ser un Excel (.xlsx).",
        )
    content = await file.read()
    return await process_bulk_upload(content, db)


@router.get("/{worker_id}", response_model=WorkerRead, dependencies=_R)
async def get_worker(worker_id: int, db: AsyncSession = Depends(get_db)):
    worker = await db.get(Worker, worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Trabajador no encontrado.")
    return worker


@router.patch("/{worker_id}", response_model=WorkerRead, dependencies=_W)
async def update_worker(worker_id: int, payload: WorkerUpdate, db: AsyncSession = Depends(get_db)):
    worker = await db.get(Worker, worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Trabajador no encontrado.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(worker, field, value)
    await db.commit()
    await db.refresh(worker)
    return worker


@router.patch(
    "/{worker_id}/archive",
    response_model=WorkerRead,
    summary="Archivar trabajador (soft delete) — sus documentos permanecen intactos",
    dependencies=_W,
)
async def archive_worker(worker_id: int, db: AsyncSession = Depends(get_db)):
    worker = await db.get(Worker, worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Trabajador no encontrado.")
    worker.is_active = False
    await db.commit()
    await db.refresh(worker)
    return worker


@router.patch(
    "/{worker_id}/restore",
    response_model=WorkerRead,
    summary="Restaurar trabajador archivado",
    dependencies=_W,
)
async def restore_worker(worker_id: int, db: AsyncSession = Depends(get_db)):
    worker = await db.get(Worker, worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Trabajador no encontrado.")
    worker.is_active = True
    await db.commit()
    await db.refresh(worker)
    return worker


@router.delete(
    "/{worker_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar trabajador permanentemente (borra documentos y asignaciones)",
    dependencies=_W,
)
async def delete_worker(worker_id: int, db: AsyncSession = Depends(get_db)):
    worker = await db.get(Worker, worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Trabajador no encontrado.")
    # Recolectar rutas de los documentos ANTES del delete (la cascada de BD los
    # borra pero deja los archivos físicos huérfanos).
    paths_result = await db.execute(
        select(WorkerDocument.file_path).where(WorkerDocument.worker_id == worker_id)
    )
    file_paths = [p for p in paths_result.scalars().all() if p]
    await db.delete(worker)
    await db.commit()
    # Best effort: la operación de BD ya se completó; limpiar archivos físicos.
    for path in file_paths:
        delete_file(path)


@router.post(
    "/{worker_id}/projects/{project_id}",
    response_model=WorkerProjectRead,
    status_code=status.HTTP_201_CREATED,
    summary="Asignar trabajador a un proyecto",
    dependencies=_W,
)
async def assign_worker_to_project(
    worker_id: int,
    project_id: int,
    db: AsyncSession = Depends(get_db),
):
    if not await db.get(Worker, worker_id):
        raise HTTPException(status_code=404, detail="Trabajador no encontrado.")
    if not await db.get(Project, project_id):
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")

    # Bloqueo duro: el trabajador debe tener al día sus Requisitos Base de la Empresa
    # (document_types con is_global_base_requirement=True) antes de poder ser asignado.
    gaps = await get_worker_base_requirements_gaps(worker_id, db)
    if gaps:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "No se puede asignar al trabajador. Mantiene documentos obligatorios "
                f"pendientes o vencidos. ({', '.join(gaps)})"
            ),
        )

    # Check if assignment already exists (including inactive ones)
    existing = await db.execute(
        select(WorkerProject).where(
            WorkerProject.worker_id == worker_id,
            WorkerProject.project_id == project_id,
        )
    )
    assignment = existing.scalar_one_or_none()
    if assignment:
        if assignment.is_active:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="El trabajador ya está asignado a este proyecto.",
            )
        # Reactivate
        assignment.is_active = True
        assignment.assigned_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(assignment)
        return assignment

    assignment = WorkerProject(
        worker_id=worker_id,
        project_id=project_id,
        assigned_at=datetime.now(timezone.utc),
    )
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)
    return assignment


@router.delete(
    "/{worker_id}/projects/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Desasignar trabajador de un proyecto",
    dependencies=_W,
)
async def unassign_worker_from_project(
    worker_id: int,
    project_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WorkerProject).where(
            WorkerProject.worker_id == worker_id,
            WorkerProject.project_id == project_id,
            WorkerProject.is_active == True,
        )
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Asignación no encontrada.")
    assignment.is_active = False
    await db.commit()
