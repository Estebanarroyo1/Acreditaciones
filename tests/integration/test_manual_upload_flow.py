"""Integration — flujo de carga MANUAL de documentos (sin IA), end-to-end HTTP.

Prueba de humo del prompt de eliminación de IA:
  - Tipo CON vigencia (365d): subir con emisión → el vencimiento se calcula y
    guarda como emisión + 365 (y se ignora cualquier vencimiento manual).
  - Tipo SIN vigencia: la subida EXIGE vencimiento manual (422 si falta); si viene,
    se guarda tal cual.
"""

from datetime import date, timedelta

import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — registra todas las tablas en Base.metadata
from app.api.v1.endpoints import worker_documents
from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.base import Base
from app.models.document_type import DocumentType

PDF_BYTES = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


class _FakeAdmin:
    id = 1
    is_admin = True
    is_active = True
    permissions: list = []


@pytest_asyncio.fixture
async def ctx(tmp_path, monkeypatch):
    # Los archivos subidos van a un tmp aislado (no ensucia uploads/).
    from app.core.config import settings

    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    session = factory()

    with_validity = DocumentType(
        name="Examen anual", is_active=True, is_global_base_requirement=True, validity_days=365
    )
    no_validity = DocumentType(
        name="Certificado sin vencimiento",
        is_active=True,
        is_global_base_requirement=True,
        validity_days=None,
    )
    session.add_all([with_validity, no_validity])
    await session.commit()

    application = FastAPI()
    application.include_router(worker_documents.router)

    async def _override_db():
        yield session

    application.dependency_overrides[get_db] = _override_db
    application.dependency_overrides[get_current_user] = lambda: _FakeAdmin()

    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client, with_validity.id, no_validity.id

    await session.close()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


def _files():
    return {"file": ("doc.pdf", PDF_BYTES, "application/pdf")}


async def test_with_validity_computes_expiry(ctx):
    client, with_id, _ = ctx
    issue = date.today()
    data = {"worker_id": "1", "document_type_id": str(with_id), "issue_date": issue.isoformat()}
    r = await client.post("/worker-documents/", data=data, files=_files())
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["issue_date"] == issue.isoformat()
    assert body["expiry_date"] == (issue + timedelta(days=365)).isoformat()


async def test_with_validity_ignores_manual_expiry(ctx):
    client, with_id, _ = ctx
    issue = date.today()
    data = {
        "worker_id": "1",
        "document_type_id": str(with_id),
        "issue_date": issue.isoformat(),
        "expiry_date": (issue + timedelta(days=10)).isoformat(),  # se ignora
    }
    r = await client.post("/worker-documents/", data=data, files=_files())
    assert r.status_code == 201, r.text
    assert r.json()["expiry_date"] == (issue + timedelta(days=365)).isoformat()


async def test_no_validity_requires_manual_expiry_422(ctx):
    client, _, no_id = ctx
    data = {
        "worker_id": "1",
        "document_type_id": str(no_id),
        "issue_date": date.today().isoformat(),
    }
    r = await client.post("/worker-documents/", data=data, files=_files())
    assert r.status_code == 422, r.text


async def test_no_validity_manual_expiry_saved(ctx):
    client, _, no_id = ctx
    expiry = (date.today() + timedelta(days=90)).isoformat()
    data = {"worker_id": "1", "document_type_id": str(no_id), "expiry_date": expiry}
    r = await client.post("/worker-documents/", data=data, files=_files())
    assert r.status_code == 201, r.text
    assert r.json()["expiry_date"] == expiry
