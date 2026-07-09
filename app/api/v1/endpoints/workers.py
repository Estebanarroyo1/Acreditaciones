import io
import os
import re
import zipfile
from datetime import datetime, timezone, date
from typing import Literal

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models.worker import Worker, WorkLocation
from app.models.associations import DocumentStatus, WorkerDocument, WorkerProject
from app.models.project import Project
from app.schemas.worker import WorkerCreate, WorkerUpdate, WorkerRead, BulkUploadResult, BulkUploadError
from app.schemas.associations import WorkerProjectRead
from app.schemas.worker_profile import WorkerFullProfile
from app.services.worker_profile import get_worker_full_profile
from app.services.accreditation import (
    get_worker_base_requirements_gaps,
    get_workers_base_requirements_map,
)

router = APIRouter(prefix="/workers", tags=["workers"])


def _sanitize_filename(name: str) -> str:
    """Reemplaza cualquier caracter fuera de [A-Za-z0-9_-] por '_'."""
    cleaned = re.sub(r"[^\w\-]+", "_", name, flags=re.UNICODE)
    return cleaned.strip("_") or "archivo"


@router.get("/", response_model=list[WorkerRead])
async def list_workers(
    status: Literal["active", "archived"] = Query("active"),
    location: Literal["planta", "obra"] | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    query = select(Worker).where(Worker.is_active == (status == "active"))
    if location is not None:
        location_enum = WorkLocation.PLANTA if location == "planta" else WorkLocation.OBRA
        query = query.where(Worker.work_location == location_enum)
    result = await db.execute(query)
    workers = result.scalars().all()
    compliance = await get_workers_base_requirements_map(db)
    out = []
    for w in workers:
        item = WorkerRead.model_validate(w)
        item.meets_base_requirements = compliance.get(w.id, True)
        out.append(item)
    return out


@router.post("/", response_model=WorkerRead, status_code=status.HTTP_201_CREATED)
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


@router.get("/{worker_id}/full-profile", response_model=WorkerFullProfile)
async def get_worker_full_profile_endpoint(
    worker_id: int, db: AsyncSession = Depends(get_db)
):
    profile = await get_worker_full_profile(worker_id, db)
    if not profile:
        raise HTTPException(status_code=404, detail="Trabajador no encontrado.")
    return profile


@router.get(
    "/{worker_id}/documents/download-zip",
    summary="Descargar documentos del trabajador como ZIP",
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


@router.get("/bulk-template", summary="Descargar plantilla Excel para carga masiva")
async def download_bulk_template():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Trabajadores"

    headers = ["Nombre", "Apellido", "RUT_DNI", "Ubicacion", "Email", "Telefono", "Fecha_Nacimiento"]
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
    date_col_letter = openpyxl.utils.get_column_letter(7)
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
        ("3. La fila 2 de la hoja 'Trabajadores' es solo un ejemplo/guía — elimínela antes de subir.", False),
        ("4. El RUT/DNI debe ser único; filas con RUT duplicado serán ignoradas.", False),
        ("5. El formato de Fecha_Nacimiento es DD/MM/AAAA (ej: 15/03/1990).", False),
        ("6. Los datos comienzan desde la fila 3 en adelante (fila 1 = encabezados, fila 2 = guía).", False),
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


_LOCATION_MAP = {
    "planta": WorkLocation.PLANTA,
    "obra": WorkLocation.OBRA,
}

_REQUIRED_COLS = ("Nombre", "Apellido", "RUT_DNI", "Ubicacion")
_ALL_COLS = ("Nombre", "Apellido", "RUT_DNI", "Ubicacion", "Email", "Telefono", "Fecha_Nacimiento")


@router.post(
    "/bulk-upload",
    response_model=BulkUploadResult,
    summary="Carga masiva de trabajadores desde Excel (.xlsx)",
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
    try:
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No se pudo leer el archivo. Asegúrate de que sea un .xlsx válido.",
        )

    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    wb.close()

    if not rows:
        raise HTTPException(status_code=422, detail="El archivo está vacío.")

    # Detect header row
    header_row = [str(c).strip() if c is not None else "" for c in rows[0]]
    if not any(col in header_row for col in _REQUIRED_COLS):
        raise HTTPException(
            status_code=422,
            detail="No se encontraron los encabezados esperados. Usa la plantilla oficial.",
        )

    def col_index(name: str) -> int | None:
        try:
            return header_row.index(name)
        except ValueError:
            return None

    idx = {col: col_index(col) for col in _ALL_COLS}

    # Pre-load existing DNIs and emails to avoid per-row DB hits
    existing_dni_result = await db.execute(select(Worker.dni))
    existing_dns: set[str] = {r[0] for r in existing_dni_result.fetchall()}
    existing_email_result = await db.execute(select(Worker.email).where(Worker.email.isnot(None)))
    existing_emails: set[str] = {r[0].lower() for r in existing_email_result.fetchall()}

    errors: list[BulkUploadError] = []
    new_workers: list[Worker] = []
    # Track DNIs seen in this batch to catch intra-file duplicates
    seen_dns: set[str] = set()
    seen_emails: set[str] = set()

    # Data rows start at row index 1; skip hint/example rows that look like hints
    data_rows = rows[1:]

    for row_offset, raw_row in enumerate(data_rows, start=2):  # 2 = Excel row number
        def cell(col_name: str) -> str:
            i = idx.get(col_name)
            if i is None or i >= len(raw_row):
                return ""
            val = raw_row[i]
            return str(val).strip() if val is not None else ""

        # Skip completely empty rows
        if not any(raw_row):
            continue

        row_num = row_offset + 1  # +1 because header is row 1
        dni_val = cell("RUT_DNI")

        # Required fields
        missing = [c for c in _REQUIRED_COLS if not cell(c)]
        if missing:
            errors.append(BulkUploadError(
                row=row_num,
                dni=dni_val or None,
                error=f"Faltan campos obligatorios: {', '.join(missing)}",
            ))
            continue

        # Ubicacion
        location_raw = cell("Ubicacion")
        location = _LOCATION_MAP.get(location_raw.lower())
        if location is None:
            errors.append(BulkUploadError(
                row=row_num,
                dni=dni_val,
                error=f"Ubicacion inválida: '{location_raw}'. Debe ser 'Planta' u 'Obra'.",
            ))
            continue

        # DNI duplicate (DB + batch)
        if dni_val.lower() in {d.lower() for d in existing_dns} or dni_val.lower() in seen_dns:
            errors.append(BulkUploadError(row=row_num, dni=dni_val, error="RUT/DNI ya existe."))
            continue

        # Email (optional but unique)
        email_val = cell("Email") or None
        if email_val:
            email_lower = email_val.lower()
            if email_lower in existing_emails or email_lower in seen_emails:
                errors.append(BulkUploadError(
                    row=row_num, dni=dni_val,
                    error=f"Email '{email_val}' ya existe en otro trabajador.",
                ))
                continue
            seen_emails.add(email_lower)

        # Birth date (optional).
        # Excel almacena fechas como objetos datetime/date; openpyxl los devuelve así.
        # Solo cuando el usuario escribió texto plano llega como str.
        birth_date: date | None = None
        birth_idx = idx.get("Fecha_Nacimiento")
        birth_raw_val = raw_row[birth_idx] if (birth_idx is not None and birth_idx < len(raw_row)) else None
        if birth_raw_val is not None and birth_raw_val != "":
            if isinstance(birth_raw_val, (datetime, date)):
                birth_date = birth_raw_val if isinstance(birth_raw_val, date) and not isinstance(birth_raw_val, datetime) else birth_raw_val.date()
            else:
                birth_str = str(birth_raw_val).strip()
                for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d"):
                    try:
                        birth_date = datetime.strptime(birth_str, fmt).date()
                        break
                    except ValueError:
                        pass
                if birth_date is None:
                    errors.append(BulkUploadError(
                        row=row_num, dni=dni_val,
                        error=f"Fecha_Nacimiento inválida: '{birth_str}'. Usa DD/MM/AAAA.",
                    ))
                    continue

        phone_val = cell("Telefono") or None

        worker = Worker(
            first_name=cell("Nombre"),
            last_name=cell("Apellido"),
            dni=dni_val,
            work_location=location,
            email=email_val,
            phone=phone_val,
            birth_date=birth_date,
        )
        new_workers.append(worker)
        seen_dns.add(dni_val.lower())

    # Bulk insert valid workers
    created = 0
    for worker in new_workers:
        db.add(worker)
        try:
            await db.flush()
            created += 1
        except IntegrityError:
            await db.rollback()
            errors.append(BulkUploadError(
                row=0,
                dni=worker.dni,
                error="Conflicto al insertar (DNI o email duplicado detectado tarde).",
            ))

    await db.commit()

    return BulkUploadResult(
        total_processed=len(data_rows) - sum(1 for r in data_rows if not any(r)),
        created=created,
        errors=errors,
    )


@router.get("/{worker_id}", response_model=WorkerRead)
async def get_worker(worker_id: int, db: AsyncSession = Depends(get_db)):
    worker = await db.get(Worker, worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Trabajador no encontrado.")
    return worker


@router.patch("/{worker_id}", response_model=WorkerRead)
async def update_worker(
    worker_id: int, payload: WorkerUpdate, db: AsyncSession = Depends(get_db)
):
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
)
async def delete_worker(worker_id: int, db: AsyncSession = Depends(get_db)):
    worker = await db.get(Worker, worker_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Trabajador no encontrado.")
    await db.delete(worker)
    await db.commit()


@router.post(
    "/{worker_id}/projects/{project_id}",
    response_model=WorkerProjectRead,
    status_code=status.HTTP_201_CREATED,
    summary="Asignar trabajador a un proyecto",
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
