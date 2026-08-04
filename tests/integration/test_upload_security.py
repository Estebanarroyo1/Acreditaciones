"""
Integration tests — política de archivos permitidos en los endpoints de
subida y descarga (trabajadores y vehículos).

Cubre los criterios de aceptación de la auditoría XSS:
  - .html renombrado a .pdf  → 422
  - PDF real                 → 201, mime_type derivado = application/pdf
  - PNG con extensión .jpg   → 422
  - header X-Content-Type-Options: nosniff en la descarga
"""
import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — registra todas las tablas en Base.metadata
from app.api.v1.endpoints import vehicle_documents, worker_documents
from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.associations import DocumentStatus, WorkerDocument
from app.models.base import Base
from app.models.document_type import DocumentType
from app.models.vehicle_document import VehicleDocument
from app.models.vehicle_document_type import VehicleDocumentType

PDF_BYTES = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 24
HTML_BYTES = b"<html><body><script>alert(document.cookie)</script></body></html>"


class _FakeAdmin:
    """Usuario simulado — omite la validación del JWT local en tests."""
    id = 1
    is_admin = True
    is_active = True
    permissions: list = []


@pytest_asyncio.fixture
async def ctx():
    # Aislar la capa de seguridad de archivos: deshabilitar la IA para que los
    # "escudos" de OpenAI no interfieran con la validación de firma/extensión.
    from app.core.config import settings as _settings

    _orig_key = _settings.OPENAI_API_KEY
    _settings.OPENAI_API_KEY = ""

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    session = factory()

    dt = DocumentType(name="Cédula", is_active=True, is_global_base_requirement=True)
    vdt = VehicleDocumentType(name="Permiso de circulación", is_active=True)
    session.add_all([dt, vdt])
    await session.commit()

    application = FastAPI()
    application.include_router(worker_documents.router)
    application.include_router(vehicle_documents.router)

    async def _override_db():
        yield session

    application.dependency_overrides[get_db] = _override_db
    application.dependency_overrides[get_current_user] = lambda: _FakeAdmin()

    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client, session, dt.id, vdt.id

    await session.close()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()
    _settings.OPENAI_API_KEY = _orig_key


# ── Trabajadores ─────────────────────────────────────────────────────────────
async def test_worker_html_renamed_to_pdf_rejected(ctx):
    client, _session, dt_id, _vdt_id = ctx
    files = {"file": ("inocente.pdf", HTML_BYTES, "application/pdf")}
    data = {"worker_id": "1", "document_type_id": str(dt_id)}
    r = await client.post("/worker-documents/", data=data, files=files)
    assert r.status_code == 422, r.text


async def test_worker_real_pdf_created(ctx):
    client, _session, dt_id, _vdt_id = ctx
    files = {"file": ("cedula.pdf", PDF_BYTES, "application/pdf")}
    data = {"worker_id": "1", "document_type_id": str(dt_id)}
    r = await client.post("/worker-documents/", data=data, files=files)
    assert r.status_code == 201, r.text
    # El MIME guardado se deriva de la firma, no del Content-Type del cliente.
    assert r.json()["mime_type"] == "application/pdf"


async def test_worker_client_content_type_is_ignored(ctx):
    # El cliente miente diciendo image/png, pero el archivo es un PDF real.
    client, _session, dt_id, _vdt_id = ctx
    files = {"file": ("cedula.pdf", PDF_BYTES, "image/png")}
    data = {"worker_id": "1", "document_type_id": str(dt_id)}
    r = await client.post("/worker-documents/", data=data, files=files)
    assert r.status_code == 201, r.text
    assert r.json()["mime_type"] == "application/pdf"


async def test_worker_png_with_jpg_extension_rejected(ctx):
    client, _session, dt_id, _vdt_id = ctx
    files = {"file": ("foto.jpg", PNG_BYTES, "image/jpeg")}
    data = {"worker_id": "1", "document_type_id": str(dt_id)}
    r = await client.post("/worker-documents/", data=data, files=files)
    assert r.status_code == 422, r.text


async def test_worker_download_has_nosniff_header(ctx, tmp_path):
    client, session, dt_id, _vdt_id = ctx
    disk = tmp_path / "doc.pdf"
    disk.write_bytes(PDF_BYTES)
    doc = WorkerDocument(
        worker_id=1,
        document_type_id=dt_id,
        file_path=str(disk),
        original_filename="doc.pdf",
        mime_type="application/pdf",
        status=DocumentStatus.APPROVED,
    )
    session.add(doc)
    await session.commit()

    r = await client.get(f"/worker-documents/{doc.id}/download")
    assert r.status_code == 200
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["content-type"].startswith("application/pdf")


async def test_worker_view_forces_attachment_for_untrusted_mime(ctx, tmp_path):
    # Documento legado con MIME no confiable → inline prohibido, se fuerza descarga.
    client, session, dt_id, _vdt_id = ctx
    disk = tmp_path / "legacy.bin"
    disk.write_bytes(b"whatever")
    doc = WorkerDocument(
        worker_id=1,
        document_type_id=dt_id,
        file_path=str(disk),
        original_filename="legacy.bin",
        mime_type="application/octet-stream",
        status=DocumentStatus.APPROVED,
    )
    session.add(doc)
    await session.commit()

    r = await client.get(f"/worker-documents/{doc.id}/view")
    assert r.status_code == 200
    assert r.headers["x-content-type-options"] == "nosniff"
    assert "attachment" in r.headers["content-disposition"]


# ── Vehículos ────────────────────────────────────────────────────────────────
async def test_vehicle_html_renamed_to_pdf_rejected(ctx):
    client, _session, _dt_id, vdt_id = ctx
    files = {"file": ("inocente.pdf", HTML_BYTES, "application/pdf")}
    data = {"vehicle_id": "1", "vehicle_document_type_id": str(vdt_id)}
    r = await client.post("/vehicle-documents/", data=data, files=files)
    assert r.status_code == 422, r.text


async def test_vehicle_real_pdf_created(ctx):
    client, _session, _dt_id, vdt_id = ctx
    files = {"file": ("permiso.pdf", PDF_BYTES, "application/pdf")}
    data = {"vehicle_id": "1", "vehicle_document_type_id": str(vdt_id)}
    r = await client.post("/vehicle-documents/", data=data, files=files)
    assert r.status_code == 201, r.text
    assert r.json()["mime_type"] == "application/pdf"


async def test_vehicle_download_has_nosniff_header(ctx, tmp_path):
    client, session, _dt_id, vdt_id = ctx
    disk = tmp_path / "permiso.pdf"
    disk.write_bytes(PDF_BYTES)
    doc = VehicleDocument(
        vehicle_id=1,
        vehicle_document_type_id=vdt_id,
        file_path=str(disk),
        original_filename="permiso.pdf",
        mime_type="application/pdf",
        status=DocumentStatus.APPROVED,
    )
    session.add(doc)
    await session.commit()

    r = await client.get(f"/vehicle-documents/{doc.id}/download")
    assert r.status_code == 200
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["content-type"].startswith("application/pdf")
