import uuid
from pathlib import Path

from fastapi import UploadFile, HTTPException, status

from app.core.config import settings


async def save_upload(
    file: UploadFile,
    project_id: int | None,
    worker_id: int,
    document_type_id: int,
) -> tuple[str, str, int]:
    """
    Persists an uploaded file under UPLOAD_DIR and returns
    (relative_file_path, mime_type, size_in_bytes).
    """
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    content = await file.read()

    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"El archivo supera el límite de {settings.MAX_UPLOAD_SIZE_MB} MB.",
        )

    dest_dir = (
        Path(settings.UPLOAD_DIR)
        / (str(project_id) if project_id is not None else "global")
        / str(worker_id)
        / str(document_type_id)
    )
    dest_dir.mkdir(parents=True, exist_ok=True)

    safe_name = f"{uuid.uuid4().hex}_{Path(file.filename or 'file').name}"
    dest_path = dest_dir / safe_name
    dest_path.write_bytes(content)

    mime = file.content_type or "application/octet-stream"
    return str(dest_path), mime, len(content)


async def save_vehicle_upload(
    file: UploadFile,
    vehicle_id: int,
    vehicle_document_type_id: int,
) -> tuple[str, str, int]:
    """Persists a vehicle document upload and returns (file_path, mime_type, size_bytes)."""
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    content = await file.read()

    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"El archivo supera el límite de {settings.MAX_UPLOAD_SIZE_MB} MB.",
        )

    dest_dir = (
        Path(settings.UPLOAD_DIR)
        / "vehicles"
        / str(vehicle_id)
        / str(vehicle_document_type_id)
    )
    dest_dir.mkdir(parents=True, exist_ok=True)

    safe_name = f"{uuid.uuid4().hex}_{Path(file.filename or 'file').name}"
    dest_path = dest_dir / safe_name
    dest_path.write_bytes(content)

    mime = file.content_type or "application/octet-stream"
    return str(dest_path), mime, len(content)
