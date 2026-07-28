import logging
import shutil
import tempfile
import uuid
from pathlib import Path

from fastapi import UploadFile, HTTPException, status

from app.core.config import (
    ALLOWED_MIME_TYPES,
    ALLOWED_UPLOAD_EXTENSIONS,
    EXTENSION_TO_MIME,
    settings,
)

logger = logging.getLogger(__name__)

# Tamaño de chunk para lectura en streaming. Nunca mantenemos en RAM más que
# un múltiplo pequeño de este valor.
_CHUNK_SIZE = 1024 * 1024  # 1 MB


def _signature_matches(content: bytes, ext: str) -> bool:
    """
    Verifica que los primeros bytes (magic bytes) del contenido correspondan
    al formato declarado por la extensión. Comparación directa de bytes, sin
    dependencias externas.
    """
    if ext == ".pdf":
        return content.startswith(b"%PDF")
    if ext in (".jpg", ".jpeg"):
        # JPEG: FF D8 FF
        return content.startswith(b"\xff\xd8\xff")
    if ext == ".png":
        # PNG: 89 50 4E 47 0D 0A 1A 0A
        return content.startswith(b"\x89PNG\r\n\x1a\n")
    if ext == ".webp":
        # RIFF <4 bytes tamaño> WEBP
        return len(content) >= 12 and content[0:4] == b"RIFF" and content[8:12] == b"WEBP"
    return False


def validate_upload(content: bytes, filename: str) -> str:
    """
    Valida un archivo subido por extensión (lista blanca) y por contenido real
    (magic bytes). Devuelve el MIME canónico derivado de la firma validada, que
    es el único valor de confianza para guardar en BD.

    Lanza HTTPException 422 si:
      - la extensión no está en ALLOWED_UPLOAD_EXTENSIONS, o
      - la firma binaria no coincide con la extensión declarada.
    """
    ext = Path(filename or "").suffix.lower()

    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
        permitidas = ", ".join(sorted(ALLOWED_UPLOAD_EXTENSIONS))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Tipo de archivo no permitido: '{ext or 'sin extensión'}'. "
                f"Solo se aceptan: {permitidas}."
            ),
        )

    if not _signature_matches(content, ext):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"El contenido del archivo no corresponde a un {ext} válido. "
                f"La firma binaria no coincide con la extensión declarada."
            ),
        )

    return EXTENSION_TO_MIME[ext]


def delete_file(file_path: str | None) -> bool:
    """Elimina un archivo del disco en modo *best effort*: nunca lanza.

    Devuelve True si el archivo se borró (o ya no existía), False si el unlink
    falló (se loggea un warning). Se usa para mantener la consistencia
    archivo↔BD: limpiar huérfanos cuando un commit falla y borrar el archivo
    físico cuando se elimina/reemplaza su registro.
    """
    if not file_path:
        return True
    try:
        Path(file_path).unlink(missing_ok=True)
        return True
    except OSError as exc:
        logger.warning("No se pudo eliminar el archivo '%s': %s", file_path, exc)
        return False


def resolve_media_type(mime_type: str | None, filename: str | None) -> str | None:
    """
    Devuelve un media_type de la lista blanca para servir un archivo, o None si
    no se puede determinar con confianza (en cuyo caso el endpoint debe forzar
    descarga como attachment).
    """
    if mime_type in ALLOWED_MIME_TYPES:
        return mime_type
    ext = Path(filename or "").suffix.lower()
    return EXTENSION_TO_MIME.get(ext)


def _too_large() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        detail=f"El archivo supera el límite de {settings.MAX_UPLOAD_SIZE_MB} MB.",
    )


async def validate_upload_head(file: UploadFile) -> str:
    """
    Valida extensión + magic bytes leyendo SOLO el primer chunk (las firmas viven
    en los primeros bytes), luego rebobina el archivo. Acota la RAM de la
    validación temprana a un chunk. Devuelve el MIME canónico.
    """
    head = await file.read(_CHUNK_SIZE)
    mime = validate_upload(head, file.filename or "")
    await file.seek(0)
    return mime


async def read_upload_capped(file: UploadFile) -> bytes:
    """
    Lee el archivo completo a memoria en chunks, abortando con 413 apenas el
    acumulado supere MAX_UPLOAD_SIZE_MB. Nunca retiene más que el límite (+1
    chunk en tránsito). Para flujos que necesitan los bytes en RAM (p. ej. IA).
    """
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    chunks: list[bytes] = []
    size = 0
    while True:
        chunk = await file.read(_CHUNK_SIZE)
        if not chunk:
            break
        size += len(chunk)
        if size > max_bytes:
            raise _too_large()
        chunks.append(chunk)
    await file.seek(0)
    return b"".join(chunks)


async def _stream_upload_to_dest(file: UploadFile, dest_dir: Path) -> tuple[str, str, int]:
    """
    Persiste `file` en `dest_dir` leyendo en chunks de 1 MB hacia un archivo
    temporal en disco, sin cargar nunca el archivo completo en RAM. Aborta con
    413 apenas el acumulado supere el límite y con 422 si la firma binaria del
    primer chunk no corresponde a la extensión declarada.

    Devuelve (ruta_final, mime_validado, tamaño_en_bytes).
    """
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    filename = file.filename or ""

    # El primer chunk basta para validar extensión + magic bytes.
    first_chunk = await file.read(_CHUNK_SIZE)
    mime = validate_upload(first_chunk, filename)

    tmp = tempfile.NamedTemporaryFile(delete=False)
    try:
        size = 0
        chunk = first_chunk
        while chunk:
            size += len(chunk)
            if size > max_bytes:
                raise _too_large()
            tmp.write(chunk)
            chunk = await file.read(_CHUNK_SIZE)
        tmp.close()

        dest_dir.mkdir(parents=True, exist_ok=True)
        safe_name = f"{uuid.uuid4().hex}_{Path(filename or 'file').name}"
        dest_path = dest_dir / safe_name
        shutil.move(tmp.name, dest_path)
    except BaseException:
        tmp.close()
        Path(tmp.name).unlink(missing_ok=True)
        raise

    return str(dest_path), mime, size


async def save_upload(
    file: UploadFile,
    project_id: int | None,
    worker_id: int,
    document_type_id: int,
) -> tuple[str, str, int]:
    """
    Persists an uploaded file under UPLOAD_DIR and returns
    (relative_file_path, mime_type, size_in_bytes).

    Lectura en streaming (chunks de 1 MB) con corte por tamaño en 413 y MIME
    derivado de la firma validada (nunca del Content-Type del cliente).
    """
    dest_dir = (
        Path(settings.UPLOAD_DIR)
        / (str(project_id) if project_id is not None else "global")
        / str(worker_id)
        / str(document_type_id)
    )
    return await _stream_upload_to_dest(file, dest_dir)


async def save_vehicle_upload(
    file: UploadFile,
    vehicle_id: int,
    vehicle_document_type_id: int,
) -> tuple[str, str, int]:
    """Persists a vehicle document upload and returns (file_path, mime_type, size_bytes).

    Lectura en streaming (chunks de 1 MB) con corte por tamaño en 413 y MIME
    derivado de la firma validada (nunca del Content-Type del cliente).
    """
    dest_dir = (
        Path(settings.UPLOAD_DIR)
        / "vehicles"
        / str(vehicle_id)
        / str(vehicle_document_type_id)
    )
    return await _stream_upload_to_dest(file, dest_dir)
