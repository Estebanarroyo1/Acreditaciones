"""Integration tests — contrato de paginación en un endpoint de listado.

Usa el router de /vehicles con la sesión SQLite en memoria y auth mockeada.
Verifica: header X-Total-Count, respeto de limit/offset y rechazo de limit>500.
"""
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.v1.endpoints import vehicles as vehicles_ep
from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.vehicle import Vehicle


class _FakeAdmin:
    id = 1
    is_admin = True
    is_active = True
    permissions: list = []


@pytest_asyncio.fixture
async def client(db_session):
    async def _override_get_db():
        yield db_session

    app = FastAPI()
    app.include_router(vehicles_ep.router)
    app.dependency_overrides[get_current_user] = lambda: _FakeAdmin()
    app.dependency_overrides[get_db] = _override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c, db_session


async def test_x_total_count_and_limit_offset(client):
    c, db = client
    for i in range(5):
        db.add(Vehicle(type="T", brand="B", model="M", license_plate=f"P{i:03d}", is_active=True))
    await db.commit()

    # Primera página de 2 → 2 items, total 5 en el header.
    r = await c.get("/vehicles/?limit=2&offset=0")
    assert r.status_code == 200
    assert r.headers["X-Total-Count"] == "5"
    body = r.json()
    assert len(body) == 2
    # Orden estable por patente.
    assert body[0]["license_plate"] == "P000"

    # Última página parcial: offset 4 → 1 item, total sigue siendo 5.
    r2 = await c.get("/vehicles/?limit=2&offset=4")
    assert r2.status_code == 200
    assert r2.headers["X-Total-Count"] == "5"
    assert len(r2.json()) == 1


async def test_default_limit_returns_all_at_small_scale(client):
    c, db = client
    for i in range(3):
        db.add(Vehicle(type="T", brand="B", model="M", license_plate=f"Q{i:03d}", is_active=True))
    await db.commit()

    r = await c.get("/vehicles/")
    assert r.status_code == 200
    assert r.headers["X-Total-Count"] == "3"
    assert len(r.json()) == 3


async def test_limit_over_max_is_rejected(client):
    c, _ = client
    r = await c.get("/vehicles/?limit=501")
    assert r.status_code == 422

    r0 = await c.get("/vehicles/?limit=0")
    assert r0.status_code == 422
