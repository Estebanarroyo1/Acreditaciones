"""
Integration tests — combinación de veredictos (TIPO + IDENTIDAD) en la subida de
documentos de trabajador, y solo TIPO en vehículos. Filosofía silencio/aviso/
confirmación, SIN bloqueo duro; override con force_validation_override.
IA mockeada (no hay red).
"""
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401
from app.api.v1.endpoints import vehicle_documents, worker_documents
from app.core import ratelimit
from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.base import Base
from app.models.document_type import DocumentType
from app.models.vehicle_document_type import VehicleDocumentType
from app.models.worker import Worker
from app.services import vehicle_ai_extractor, worker_ai_extractor

PDF_BYTES = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


class _FakeAdmin:
    id = 1
    is_admin = True
    is_active = True
    permissions: list = []


@pytest_asyncio.fixture
async def ctx():
    from app.core.config import settings as _settings

    _orig = _settings.OPENAI_API_KEY
    _settings.OPENAI_API_KEY = "test-key"
    ratelimit._calls.clear()

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    session = factory()

    dt = DocumentType(
        name="Cédula", is_active=True, is_global_base_requirement=True, ai_validation_enabled=True
    )
    vdt = VehicleDocumentType(name="Permiso de circulación", is_active=True, ai_validation_enabled=True)
    worker = Worker(first_name="Juan", last_name="Pérez", dni="11.111.111-1")
    session.add_all([dt, vdt, worker])
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
        yield client, {"dt": dt.id, "vdt": vdt.id, "worker": worker.id}

    await session.close()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()
    _settings.OPENAI_API_KEY = _orig
    ratelimit._calls.clear()


def _file():
    return {"file": ("doc.pdf", PDF_BYTES, "application/pdf")}


def _mock_worker_ai(monkeypatch, *, type_v="match", person_v="match"):
    async def _extract(*args, **kwargs):
        return {
            "issue_date": None, "expiry_date": None, "document_type_detected": "Contrato",
            "match_confidence": type_v, "type_reasoning": f"tipo {type_v}",
            "person_name_detected": "Otra Persona", "person_match": person_v,
            "identity_reasoning": f"identidad {person_v}",
        }

    monkeypatch.setattr(worker_ai_extractor, "extract_dates", _extract)


def _mock_vehicle_ai(monkeypatch, *, type_v="match"):
    async def _extract(*args, **kwargs):
        return {
            "issue_date": None, "expiry_date": None, "document_type_detected": "Otro",
            "match_confidence": type_v, "type_reasoning": f"tipo {type_v}",
            "detected_document_name": "Otro documento",
        }

    monkeypatch.setattr(vehicle_ai_extractor, "extract_and_validate", _extract)


def _worker_data(ids, **extra):
    return {"worker_id": str(ids["worker"]), "document_type_id": str(ids["dt"]), **extra}


# ── Trabajadores: tipo + identidad ───────────────────────────────────────────
async def test_double_match_is_silent_201(ctx, monkeypatch):
    client, ids = ctx
    _mock_worker_ai(monkeypatch, type_v="match", person_v="match")
    r = await client.post("/worker-documents/", data=_worker_data(ids), files=_file())
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["warnings"] == []
    assert body["validation_override_used"] is False
    assert body["validation_notes"] is None


async def test_identity_likely_returns_warning_201(ctx, monkeypatch):
    client, ids = ctx
    _mock_worker_ai(monkeypatch, person_v="likely_match")
    r = await client.post("/worker-documents/", data=_worker_data(ids), files=_file())
    assert r.status_code == 201, r.text
    warnings = r.json()["warnings"]
    assert len(warnings) == 1
    assert warnings[0]["dimension"] == "identity"
    assert warnings[0]["level"] == "info"
    assert r.json()["validation_override_used"] is False


async def test_identity_mismatch_without_override_409(ctx, monkeypatch):
    client, ids = ctx
    _mock_worker_ai(monkeypatch, type_v="match", person_v="mismatch")
    r = await client.post("/worker-documents/", data=_worker_data(ids), files=_file())
    assert r.status_code == 409, r.text
    detail = r.json()["detail"]
    assert detail["retryable"] is True
    assert detail["override_field"] == "force_validation_override"
    assert detail["identity"]["expected_name"] == "Juan Pérez"
    assert detail["identity"]["detected_name"] == "Otra Persona"
    assert "type" not in detail  # el tipo estaba match


async def test_identity_mismatch_with_override_201(ctx, monkeypatch):
    client, ids = ctx
    _mock_worker_ai(monkeypatch, person_v="mismatch")
    r = await client.post(
        "/worker-documents/",
        data=_worker_data(ids, force_validation_override="true"),
        files=_file(),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["validation_override_used"] is True
    assert body["validation_notes"]  # guarda el reasoning para auditoría


async def test_type_mismatch_409_details_type(ctx, monkeypatch):
    client, ids = ctx
    _mock_worker_ai(monkeypatch, type_v="mismatch", person_v="match")
    r = await client.post("/worker-documents/", data=_worker_data(ids), files=_file())
    assert r.status_code == 409, r.text
    detail = r.json()["detail"]
    assert detail["type"]["expected"] == "Cédula"
    assert detail["type"]["detected"] == "Contrato"
    assert "identity" not in detail


# ── Vehículos: solo tipo ─────────────────────────────────────────────────────
async def test_vehicle_type_mismatch_409(ctx, monkeypatch):
    client, ids = ctx
    _mock_vehicle_ai(monkeypatch, type_v="mismatch")
    data = {"vehicle_id": "1", "vehicle_document_type_id": str(ids["vdt"])}
    r = await client.post("/vehicle-documents/", data=data, files=_file())
    assert r.status_code == 409, r.text
    detail = r.json()["detail"]
    assert detail["type"]["detected"] == "Otro documento"
    assert detail["retryable"] is True


async def test_vehicle_type_mismatch_with_override_201(ctx, monkeypatch):
    client, ids = ctx
    _mock_vehicle_ai(monkeypatch, type_v="mismatch")
    data = {
        "vehicle_id": "1", "vehicle_document_type_id": str(ids["vdt"]),
        "force_validation_override": "true",
    }
    r = await client.post("/vehicle-documents/", data=data, files=_file())
    assert r.status_code == 201, r.text
    assert r.json()["type_override_used"] is True
