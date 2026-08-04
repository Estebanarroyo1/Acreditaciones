"""Integration tests — autenticación local (login, tokens, cambio de contraseña).

Se llaman las funciones de endpoint / dependencias directamente con una sesión
SQLite en memoria (mismo estilo que el resto de la suite de integración).
"""
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

import app.core.auth as auth_module
from app.api.v1.endpoints.auth import change_password, login
from app.core.auth import create_access_token, get_current_user
from app.core.config import settings
from app.core.security import hash_password
from app.models.user import User
from app.schemas.auth import ChangePasswordRequest, LoginRequest


async def _make_user(
    db,
    *,
    email: str = "user@company.com",
    password: str = "correcta123",
    is_active: bool = True,
    must_change: bool = False,
) -> User:
    user = User(
        email=email,
        hashed_password=hash_password(password),
        full_name="Test User",
        is_admin=False,
        is_active=is_active,
        must_change_password=must_change,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


def _creds(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


@pytest.fixture(autouse=True)
def _enable_auth(monkeypatch):
    """Los tests de token requieren la validación real (no el stub AUTH_DISABLED)."""
    monkeypatch.setattr(auth_module.settings, "AUTH_DISABLED", False)


class TestLogin:
    async def test_login_success_returns_token(self, db_session):
        await _make_user(db_session, must_change=True)
        resp = await login(LoginRequest(email="user@company.com", password="correcta123"), db_session)
        assert resp.token_type == "bearer"
        assert resp.must_change_password is True
        assert resp.user.email == "user@company.com"
        # El token es válido y su sub apunta al usuario.
        payload = jwt.decode(resp.access_token, settings.JWT_SECRET_KEY, algorithms=["HS256"])
        assert payload["sub"] == str(resp.user.id)

    async def test_login_updates_last_login(self, db_session):
        user = await _make_user(db_session)
        assert user.last_login_at is None
        await login(LoginRequest(email="user@company.com", password="correcta123"), db_session)
        await db_session.refresh(user)
        assert user.last_login_at is not None

    async def test_login_wrong_password_401(self, db_session):
        await _make_user(db_session)
        with pytest.raises(HTTPException) as exc:
            await login(LoginRequest(email="user@company.com", password="incorrecta1"), db_session)
        assert exc.value.status_code == 401

    async def test_login_unknown_email_401(self, db_session):
        with pytest.raises(HTTPException) as exc:
            await login(LoginRequest(email="nadie@company.com", password="loquesea123"), db_session)
        assert exc.value.status_code == 401

    async def test_login_inactive_user_403(self, db_session):
        await _make_user(db_session, is_active=False)
        with pytest.raises(HTTPException) as exc:
            await login(LoginRequest(email="user@company.com", password="correcta123"), db_session)
        assert exc.value.status_code == 403


class TestTokenValidation:
    async def test_valid_token_loads_user(self, db_session):
        user = await _make_user(db_session)
        token = create_access_token(user)
        loaded = await get_current_user(credentials=_creds(token), db=db_session)
        assert loaded.id == user.id

    async def test_missing_credentials_401(self, db_session):
        with pytest.raises(HTTPException) as exc:
            await get_current_user(credentials=None, db=db_session)
        assert exc.value.status_code == 401

    async def test_expired_token_401(self, db_session):
        user = await _make_user(db_session)
        expired = jwt.encode(
            {"sub": str(user.id), "exp": datetime.now(timezone.utc) - timedelta(minutes=1)},
            settings.JWT_SECRET_KEY,
            algorithm="HS256",
        )
        with pytest.raises(HTTPException) as exc:
            await get_current_user(credentials=_creds(expired), db=db_session)
        assert exc.value.status_code == 401

    async def test_tampered_token_401(self, db_session):
        user = await _make_user(db_session)
        token = create_access_token(user)
        # Corrompemos el primer carácter de la firma (bits significativos) → firma inválida.
        header, payload, sig = token.split(".")
        sig = ("a" if sig[0] != "a" else "b") + sig[1:]
        tampered = f"{header}.{payload}.{sig}"
        with pytest.raises(HTTPException) as exc:
            await get_current_user(credentials=_creds(tampered), db=db_session)
        assert exc.value.status_code == 401

    async def test_token_signed_with_other_secret_401(self, db_session):
        user = await _make_user(db_session)
        forged = jwt.encode(
            {"sub": str(user.id), "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
            "otra-clave-totalmente-distinta-1234567890",
            algorithm="HS256",
        )
        with pytest.raises(HTTPException) as exc:
            await get_current_user(credentials=_creds(forged), db=db_session)
        assert exc.value.status_code == 401

    async def test_token_for_deleted_user_401(self, db_session):
        user = await _make_user(db_session)
        token = create_access_token(user)
        await db_session.delete(user)
        await db_session.commit()
        with pytest.raises(HTTPException) as exc:
            await get_current_user(credentials=_creds(token), db=db_session)
        assert exc.value.status_code == 401

    async def test_inactive_user_token_403(self, db_session):
        user = await _make_user(db_session)
        token = create_access_token(user)
        user.is_active = False
        await db_session.commit()
        with pytest.raises(HTTPException) as exc:
            await get_current_user(credentials=_creds(token), db=db_session)
        assert exc.value.status_code == 403


class TestChangePassword:
    async def test_change_password_success(self, db_session):
        user = await _make_user(db_session, password="vieja12345", must_change=False)
        body = ChangePasswordRequest(current_password="vieja12345", new_password="nueva67890")
        updated = await change_password(body, current_user=user, db=db_session)
        assert updated.must_change_password is False
        # La contraseña nueva funciona y la vieja no.
        from app.core.security import verify_password

        assert verify_password("nueva67890", updated.hashed_password) is True
        assert verify_password("vieja12345", updated.hashed_password) is False

    async def test_change_password_wrong_current_401(self, db_session):
        user = await _make_user(db_session, password="vieja12345")
        body = ChangePasswordRequest(current_password="equivocada1", new_password="nueva67890")
        with pytest.raises(HTTPException) as exc:
            await change_password(body, current_user=user, db=db_session)
        assert exc.value.status_code == 401

    async def test_change_password_weak_new_422(self, db_session):
        user = await _make_user(db_session, password="vieja12345")
        body = ChangePasswordRequest(current_password="vieja12345", new_password="corta")
        with pytest.raises(HTTPException) as exc:
            await change_password(body, current_user=user, db=db_session)
        assert exc.value.status_code == 422

    async def test_change_password_works_in_must_change_state(self, db_session):
        # Requisito clave: en estado must_change_password=True el cambio DEBE funcionar.
        user = await _make_user(db_session, password="temporal123", must_change=True)
        body = ChangePasswordRequest(current_password="temporal123", new_password="definitiva9")
        updated = await change_password(body, current_user=user, db=db_session)
        assert updated.must_change_password is False
