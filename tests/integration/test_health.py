"""Integration tests — endpoint de monitoreo GET /health.

El ping real a la BD (`ping_database`) se mockea porque el suite no tiene una
BD Postgres levantada; lo que se verifica es el contrato del endpoint:
  - BD responde  → 200 {"status": "ok",    "database": true}
  - BD caída     → 503 {"status": "error", "database": false}
"""
from httpx import ASGITransport, AsyncClient

import app.main as main_module


async def _get_health() -> tuple[int, dict]:
    transport = ASGITransport(app=main_module.app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/health")
    return r.status_code, r.json()


async def test_health_returns_200_when_db_ok(monkeypatch):
    async def _ok(*args, **kwargs):
        return True

    monkeypatch.setattr(main_module, "ping_database", _ok)

    status_code, body = await _get_health()

    assert status_code == 200
    assert body == {"status": "ok", "database": True}


async def test_health_returns_503_when_db_down(monkeypatch):
    async def _down(*args, **kwargs):
        return False

    monkeypatch.setattr(main_module, "ping_database", _down)

    status_code, body = await _get_health()

    assert status_code == 503
    assert body == {"status": "error", "database": False}
