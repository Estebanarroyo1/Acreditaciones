import io
from datetime import date, datetime

import openpyxl
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.worker import Worker, WorkLocation
from app.schemas.worker import BulkUploadError, BulkUploadResult

_LOCATION_MAP = {
    "planta": WorkLocation.PLANTA,
    "obra": WorkLocation.OBRA,
}

_REQUIRED_COLS = ("Nombre", "Apellido", "RUT_DNI", "Ubicacion")
_ALL_COLS = ("Nombre", "Apellido", "RUT_DNI", "Ubicacion", "Email", "Telefono", "Fecha_Nacimiento")


async def process_bulk_upload(content: bytes, db: AsyncSession) -> BulkUploadResult:
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
    # Track DNIs/emails seen in this batch to catch intra-file duplicates
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
