"""
Integration tests — endurecimiento de los endpoints de IA (/ai-scan):
  - rate limiting por usuario → 429 al exceder AI_SCAN_MAX_PER_MINUTE
  - timeout de OpenAI (mockeado) → 504 con mensaje claro
"""
import httpx
import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from openai import APITimeoutError

from app.api.v1.endpoints import worker_documents
from app.core import ratelimit
from app.core.auth import get_current_user

PDF_BYTES = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


class _FakeAdmin:
    id = 1
    is_admin = True
    is_active = True
    permissions: list = []


@pytest_asyncio.fixture
async def client():
    ratelimit._calls.clear()  # aislar el contador global entre tests

    application = FastAPI()
    application.include_router(worker_documents.router)
    application.dependency_overrides[get_current_user] = lambda: _FakeAdmin()

    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c

    ratelimit._calls.clear()


def _file():
    return {"file": ("doc.pdf", PDF_BYTES, "application/pdf")}


async def test_ai_scan_rate_limited_returns_429(client, monkeypatch):
    from app.core.config import settings

    # Límite bajo para el test; sin API key → el body responde 503, pero la
    # dependencia de rate limit corre ANTES y es la que debe disparar el 429.
    monkeypatch.setattr(settings, "AI_SCAN_MAX_PER_MINUTE", 2)
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "")

    r1 = await client.post("/worker-documents/ai-scan", files=_file())
    r2 = await client.post("/worker-documents/ai-scan", files=_file())
    r3 = await client.post("/worker-documents/ai-scan", files=_file())

    assert r1.status_code == 503  # dentro del límite, cae en "IA no configurada"
    assert r2.status_code == 503
    assert r3.status_code == 429  # excede AI_SCAN_MAX_PER_MINUTE


async def test_ai_scan_openai_timeout_returns_504(client, monkeypatch):
    from app.core.config import settings
    from app.services import worker_ai_extractor

    monkeypatch.setattr(settings, "AI_SCAN_MAX_PER_MINUTE", 10)
    monkeypatch.setattr(settings, "OPENAI_API_KEY", "test-key")

    async def _fake_extract(*args, **kwargs):
        raise APITimeoutError(request=httpx.Request("POST", "https://api.openai.com"))

    monkeypatch.setattr(worker_ai_extractor, "extract_dates", _fake_extract)

    r = await client.post("/worker-documents/ai-scan", files=_file())

    assert r.status_code == 504
    assert "tardó demasiado" in r.json()["detail"]
