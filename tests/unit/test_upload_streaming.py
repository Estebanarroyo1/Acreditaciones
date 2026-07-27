"""
Unit tests — la persistencia de archivos lee en streaming (chunks de 1 MB) y
aborta con 413 apenas se supera el límite, sin leer el archivo completo.
"""
import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.services import storage

_MB = 1024 * 1024


class _FakeUpload:
    """UploadFile simulado que produce `total_bytes` en chunks, contando lecturas.

    El primer chunk lleva una firma PDF válida para pasar la validación de
    magic bytes; el resto son ceros.
    """

    def __init__(self, filename: str, total_bytes: int):
        self.filename = filename
        self._total = total_bytes
        self._pos = 0
        self._first = True
        self.read_calls = 0

    async def read(self, size: int = -1) -> bytes:
        self.read_calls += 1
        remaining = self._total - self._pos
        if remaining <= 0:
            return b""
        n = remaining if size is None or size < 0 else min(size, remaining)
        self._pos += n
        if self._first:
            self._first = False
            magic = b"%PDF-1.4"
            return magic + b"\x00" * (n - len(magic))
        return b"\x00" * n

    async def seek(self, pos: int) -> None:
        self._pos = pos
        self._first = pos == 0


async def test_save_upload_aborts_oversize_without_full_read(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "MAX_UPLOAD_SIZE_MB", 1)
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))

    fake = _FakeUpload("big.pdf", total_bytes=5 * _MB)  # 5 MB, límite 1 MB

    with pytest.raises(HTTPException) as exc:
        await storage.save_upload(fake, None, 1, 1)

    assert exc.value.status_code == 413
    # Streaming: se abortó tras ~2 chunks; jamás se leyeron los 5 MB completos.
    assert fake.read_calls <= 2, f"leyó {fake.read_calls} chunks, esperado ≤2"


async def test_save_vehicle_upload_aborts_oversize(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "MAX_UPLOAD_SIZE_MB", 1)
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))

    fake = _FakeUpload("big.pdf", total_bytes=5 * _MB)

    with pytest.raises(HTTPException) as exc:
        await storage.save_vehicle_upload(fake, 1, 1)

    assert exc.value.status_code == 413
    assert fake.read_calls <= 2


async def test_read_upload_capped_aborts_oversize(monkeypatch):
    monkeypatch.setattr(settings, "MAX_UPLOAD_SIZE_MB", 1)
    fake = _FakeUpload("big.pdf", total_bytes=5 * _MB)

    with pytest.raises(HTTPException) as exc:
        await storage.read_upload_capped(fake)

    assert exc.value.status_code == 413
    assert fake.read_calls <= 2


async def test_save_upload_persists_valid_file(monkeypatch, tmp_path):
    # Un archivo dentro del límite se persiste y devuelve (path, mime, size).
    monkeypatch.setattr(settings, "MAX_UPLOAD_SIZE_MB", 10)
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))

    fake = _FakeUpload("ok.pdf", total_bytes=2 * _MB)
    path, mime, size = await storage.save_upload(fake, None, 7, 3)

    assert mime == "application/pdf"
    assert size == 2 * _MB
    from pathlib import Path

    assert Path(path).exists()
