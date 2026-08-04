"""Integration tests — GET /auth/me sobre el ciclo HTTP real (ASGI).

Regresión del bug donde el menú/administración no aparecían porque el frontend
recibía un usuario sin datos: aquí verificamos que /auth/me, con un token válido,
responde 200 con is_admin=true y la lista de permisos correctamente serializada
(la relación `permissions` debe cargarse eager dentro de la sesión async, sin
lazy-load fuera de contexto).
"""

import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

import app.core.auth as auth_module
from app.api.v1.endpoints import auth as auth_endpoints
from app.core.auth import create_access_token
from app.core.security import hash_password
from app.db.session import get_db
from app.models.user import ModulePermission, User
from scripts.create_admin import upsert_admin


@pytest_asyncio.fixture
async def client(db_session, monkeypatch):
    # Ejercitamos el get_current_user REAL (no lo sobreescribimos): sin AUTH_DISABLED.
    monkeypatch.setattr(auth_module.settings, "AUTH_DISABLED", False)

    async def _override_get_db():
        yield db_session

    application = FastAPI()
    application.include_router(auth_endpoints.router)
    application.dependency_overrides[get_db] = _override_get_db

    transport = ASGITransport(app=application)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def test_auth_me_returns_admin_with_permissions(client, db_session):
    user = User(
        email="admin@company.com",
        hashed_password=hash_password("clavefuerte123"),
        full_name="Admin Real",
        is_admin=True,
        is_active=True,
        must_change_password=False,
    )
    user.permissions = [
        ModulePermission(module="trabajadores", level="write"),
        ModulePermission(module="reportes", level="read"),
    ]
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    token = create_access_token(user)
    res = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert res.status_code == 200
    body = res.json()
    assert body["is_admin"] is True
    assert body["is_active"] is True
    assert body["must_change_password"] is False
    # Nunca se expone el hash.
    assert "hashed_password" not in body
    # Los permisos se serializan completos.
    perms = {(p["module"], p["level"]) for p in body["permissions"]}
    assert perms == {("trabajadores", "write"), ("reportes", "read")}


async def test_auth_me_without_token_is_401(client):
    res = await client.get("/auth/me")
    assert res.status_code == 401


async def test_bootstrapped_admin_authenticates_and_is_admin(client, db_session):
    # Admin creado por el mismo flujo que scripts/create_admin (núcleo upsert_admin).
    user, created = await upsert_admin(
        db_session, email="jefe@empresa.com", full_name="Jefe", password="clavefuerte123"
    )
    assert created is True

    token = create_access_token(user)
    res = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})

    assert res.status_code == 200
    body = res.json()
    assert body["email"] == "jefe@empresa.com"
    assert body["is_admin"] is True
    assert body["is_active"] is True
    # El admin de consola no queda atrapado por el guard de cambio obligatorio.
    assert body["must_change_password"] is False
