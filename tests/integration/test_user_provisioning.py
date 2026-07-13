"""Integration tests for auto-provisioning users from Entra ID JWTs."""
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.core.auth import get_current_user
from app.models.user import User


def _mock_credentials(token: str = "fake-token") -> MagicMock:
    creds = MagicMock()
    creds.credentials = token
    return creds


def _mock_jwks_and_decode(payload: dict):
    """Context managers that mock JWT validation to return payload."""
    mock_client = patch("app.core.auth._get_jwks_client")
    mock_decode = patch("app.core.auth.jwt.decode", return_value=payload)
    return mock_client, mock_decode


class TestAutoProvisioning:
    async def test_new_user_is_created_from_token(self, db_session):
        payload = {"oid": "new-oid-abc", "email": "newuser@company.com", "name": "New User"}
        m_client, m_decode = _mock_jwks_and_decode(payload)

        with m_client as mc, m_decode:
            mc.return_value.get_signing_key_from_jwt.return_value = MagicMock()
            with patch("app.core.auth.settings") as mock_settings:
                mock_settings.AUTH_DISABLED = False
                mock_settings.ENTRA_TENANT_ID = "tenant"
                mock_settings.ENTRA_CLIENT_ID = "client"
                mock_settings.ADMIN_EMAILS = ""
                user = await get_current_user(credentials=_mock_credentials(), db=db_session)

        assert user.entra_oid == "new-oid-abc"
        assert user.email == "newuser@company.com"
        assert user.full_name == "New User"
        assert user.is_admin is False
        assert user.is_active is True

        result = await db_session.execute(select(User).where(User.entra_oid == "new-oid-abc"))
        assert result.scalar_one_or_none() is not None

    async def test_admin_email_grants_is_admin(self, db_session):
        payload = {"oid": "admin-oid-xyz", "email": "boss@company.com", "name": "Boss"}
        m_client, m_decode = _mock_jwks_and_decode(payload)

        with m_client as mc, m_decode:
            mc.return_value.get_signing_key_from_jwt.return_value = MagicMock()
            with patch("app.core.auth.settings") as mock_settings:
                mock_settings.AUTH_DISABLED = False
                mock_settings.ENTRA_TENANT_ID = "tenant"
                mock_settings.ENTRA_CLIENT_ID = "client"
                mock_settings.ADMIN_EMAILS = "boss@company.com,other@company.com"
                user = await get_current_user(credentials=_mock_credentials(), db=db_session)

        assert user.is_admin is True

    async def test_existing_user_last_login_is_updated(self, db_session):
        existing = User(
            entra_oid="existing-oid",
            email="existing@co.com",
            full_name="Existing",
            is_admin=False,
            is_active=True,
        )
        db_session.add(existing)
        await db_session.commit()

        payload = {"oid": "existing-oid", "email": "existing@co.com", "name": "Existing"}
        m_client, m_decode = _mock_jwks_and_decode(payload)
        before = datetime.now(timezone.utc)

        with m_client as mc, m_decode:
            mc.return_value.get_signing_key_from_jwt.return_value = MagicMock()
            with patch("app.core.auth.settings") as mock_settings:
                mock_settings.AUTH_DISABLED = False
                mock_settings.ENTRA_TENANT_ID = "tenant"
                mock_settings.ENTRA_CLIENT_ID = "client"
                mock_settings.ADMIN_EMAILS = ""
                user = await get_current_user(credentials=_mock_credentials(), db=db_session)

        assert user.last_login_at is not None
        assert user.last_login_at.replace(tzinfo=timezone.utc) >= before

    async def test_inactive_user_raises_403(self, db_session):
        inactive = User(
            entra_oid="inactive-oid",
            email="inactive@co.com",
            full_name="Inactive",
            is_admin=False,
            is_active=False,
        )
        db_session.add(inactive)
        await db_session.commit()

        payload = {"oid": "inactive-oid", "email": "inactive@co.com", "name": "Inactive"}
        m_client, m_decode = _mock_jwks_and_decode(payload)

        with m_client as mc, m_decode:
            mc.return_value.get_signing_key_from_jwt.return_value = MagicMock()
            with patch("app.core.auth.settings") as mock_settings:
                mock_settings.AUTH_DISABLED = False
                mock_settings.ENTRA_TENANT_ID = "tenant"
                mock_settings.ENTRA_CLIENT_ID = "client"
                mock_settings.ADMIN_EMAILS = ""
                with pytest.raises(HTTPException) as exc_info:
                    await get_current_user(credentials=_mock_credentials(), db=db_session)

        assert exc_info.value.status_code == 403

    async def test_missing_oid_raises_401(self, db_session):
        payload = {"email": "nooid@co.com", "name": "No OID"}  # no "oid" key
        m_client, m_decode = _mock_jwks_and_decode(payload)

        with m_client as mc, m_decode:
            mc.return_value.get_signing_key_from_jwt.return_value = MagicMock()
            with patch("app.core.auth.settings") as mock_settings:
                mock_settings.AUTH_DISABLED = False
                mock_settings.ENTRA_TENANT_ID = "tenant"
                mock_settings.ENTRA_CLIENT_ID = "client"
                mock_settings.ADMIN_EMAILS = ""
                with pytest.raises(HTTPException) as exc_info:
                    await get_current_user(credentials=_mock_credentials(), db=db_session)

        assert exc_info.value.status_code == 401
