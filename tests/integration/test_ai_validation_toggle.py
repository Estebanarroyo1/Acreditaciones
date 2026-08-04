"""
Integration tests — validación de IA activable/desactivable POR TIPO de documento
(trabajadores y vehículos).

Regla: si el tipo tiene `ai_validation_enabled=False`, la subida NO debe llamar
al extractor de IA (ni gastar la llamada a OpenAI); el documento se guarda igual
con las fechas manuales. Si es True, sí debe llamar al extractor.
"""
import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — registra todas las tablas en Base.metadata
from app.api.v1.endpoints import vehicle_documents, worker_documents
from app.core import ratelimit
from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.base import Base
from app.models.document_type import DocumentType
from app.models.vehicle_document_type import VehicleDocumentType
from app.services import vehicle_ai_extractor, worker_ai_extractor

PDF_BYTES = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


class _FakeAdmin:
    id = 1
    is_admin = True
    is_active = True
    permissions: list = []


class _Spy:
    """Reemplaza a un extractor de IA async y cuenta invocaciones."""

    def __init__(self, result):
        self.calls = 0
        self._result = result

    async def __call__(self, *args, **kwargs):
        self.calls += 1
        return self._result


@pytest_asyncio.fixture
async def ctx():
    # IA "configurada" (hay API key) para probar que igual se SALTA cuando el
    # tipo la tiene apagada — no por falta de key, sino por la regla del tipo.
    from app.core.config import settings as _settings

    _orig_key = _settings.OPENAI_API_KEY
    _settings.OPENAI_API_KEY = "test-key"
    ratelimit._calls.clear()

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    session = factory()

    dt_ai = DocumentType(
        name="Certificado con IA", is_active=True,
        is_global_base_requirement=True, ai_validation_enabled=True,
    )
    dt_manual = DocumentType(
        name="Certificado de estudios (manual)", is_active=True,
        is_global_base_requirement=True, ai_validation_enabled=False,
    )
    vdt_ai = VehicleDocumentType(name="Permiso con IA", is_active=True, ai_validation_enabled=True)
    vdt_manual = VehicleDocumentType(
        name="Permiso manual", is_active=True, ai_validation_enabled=False
    )
    session.add_all([dt_ai, dt_manual, vdt_ai, vdt_manual])
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
        yield client, {
            "dt_ai": dt_ai.id, "dt_manual": dt_manual.id,
            "vdt_ai": vdt_ai.id, "vdt_manual": vdt_manual.id,
        }

    await session.close()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()
    _settings.OPENAI_API_KEY = _orig_key
    ratelimit._calls.clear()


def _file():
    return {"file": ("doc.pdf", PDF_BYTES, "application/pdf")}


# ── Trabajadores ─────────────────────────────────────────────────────────────
async def test_worker_upload_manual_type_skips_ai(ctx, monkeypatch):
    client, ids = ctx
    spy = _Spy({"issue_date": None, "expiry_date": None, "document_type_detected": None})
    monkeypatch.setattr(worker_ai_extractor, "extract_dates", spy)

    data = {"worker_id": "1", "document_type_id": str(ids["dt_manual"])}
    r = await client.post("/worker-documents/", data=data, files=_file())

    assert r.status_code == 201, r.text
    assert spy.calls == 0  # tipo manual → NO se invoca la IA


async def test_worker_upload_ai_type_calls_extractor(ctx, monkeypatch):
    client, ids = ctx
    spy = _Spy({"issue_date": None, "expiry_date": None, "document_type_detected": None})
    monkeypatch.setattr(worker_ai_extractor, "extract_dates", spy)

    data = {"worker_id": "1", "document_type_id": str(ids["dt_ai"])}
    r = await client.post("/worker-documents/", data=data, files=_file())

    assert r.status_code == 201, r.text
    assert spy.calls == 1  # tipo con IA → sí se invoca el extractor


async def test_worker_ai_scan_manual_type_skips_openai(ctx, monkeypatch):
    client, ids = ctx
    spy = _Spy({"issue_date": None, "expiry_date": None, "document_type_detected": None})
    monkeypatch.setattr(worker_ai_extractor, "extract_dates", spy)

    data = {"document_type_id": str(ids["dt_manual"])}
    r = await client.post("/worker-documents/ai-scan", data=data, files=_file())

    assert r.status_code == 200, r.text
    assert r.json()["ai_validation_enabled"] is False
    assert spy.calls == 0


# ── Vehículos ────────────────────────────────────────────────────────────────
async def test_vehicle_upload_manual_type_skips_ai(ctx, monkeypatch):
    client, ids = ctx
    spy = _Spy(
        {"match_confidence": "match", "type_reasoning": None, "issue_date": None,
         "expiry_date": None, "detected_document_name": None, "document_type_detected": None}
    )
    monkeypatch.setattr(vehicle_ai_extractor, "extract_and_validate", spy)

    data = {"vehicle_id": "1", "vehicle_document_type_id": str(ids["vdt_manual"])}
    r = await client.post("/vehicle-documents/", data=data, files=_file())

    assert r.status_code == 201, r.text
    assert spy.calls == 0  # tipo manual → NO se invoca la IA


async def test_vehicle_upload_ai_type_calls_extractor(ctx, monkeypatch):
    client, ids = ctx
    spy = _Spy(
        {"match_confidence": "match", "type_reasoning": None, "issue_date": None,
         "expiry_date": None, "detected_document_name": None, "document_type_detected": None}
    )
    monkeypatch.setattr(vehicle_ai_extractor, "extract_and_validate", spy)

    data = {"vehicle_id": "1", "vehicle_document_type_id": str(ids["vdt_ai"])}
    r = await client.post("/vehicle-documents/", data=data, files=_file())

    assert r.status_code == 201, r.text
    assert spy.calls == 1  # tipo con IA → sí se invoca el extractor
