"""Integration tests — bootstrap del primer admin.

Cubre el núcleo del script `scripts/create_admin.py` (`upsert_admin`) y el endpoint
público `/auth/setup-status`. Se usa la sesión SQLite en memoria de la suite.
"""

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app.api.v1.endpoints.auth import setup_status
from app.core.security import verify_password
from app.models.user import User
from scripts.create_admin import upsert_admin


async def _count_users(db) -> int:
    result = await db.execute(select(func.count()).select_from(User))
    return result.scalar_one()


class TestUpsertAdmin:
    async def test_creates_admin(self, db_session):
        user, created = await upsert_admin(
            db_session, email="Jefe@Empresa.com", full_name="Jefe", password="segura12345"
        )
        assert created is True
        assert user.email == "jefe@empresa.com"  # normalizado
        assert user.is_admin is True
        assert user.is_active is True
        # El operador definió su propia contraseña → no se le fuerza a cambiarla.
        assert user.must_change_password is False
        assert verify_password("segura12345", user.hashed_password) is True

    async def test_idempotent_second_run_updates_same_user(self, db_session):
        await upsert_admin(
            db_session, email="jefe@empresa.com", full_name="Jefe", password="segura12345"
        )
        user2, created2 = await upsert_admin(
            db_session, email="jefe@empresa.com", full_name="Jefe", password="otraclave678"
        )
        assert created2 is False
        assert await _count_users(db_session) == 1  # no se duplica
        assert verify_password("otraclave678", user2.hashed_password) is True

    async def test_promotes_existing_non_admin(self, db_session):
        from app.core.security import hash_password

        existing = User(
            email="user@empresa.com",
            hashed_password=hash_password("vieja12345"),
            is_admin=False,
            is_active=False,
            must_change_password=True,
        )
        db_session.add(existing)
        await db_session.commit()

        user, created = await upsert_admin(
            db_session, email="user@empresa.com", full_name=None, password="nueva67890"
        )
        assert created is False
        assert user.is_admin is True
        assert user.is_active is True
        assert user.must_change_password is False
        assert verify_password("nueva67890", user.hashed_password) is True

    async def test_weak_password_rejected(self, db_session):
        with pytest.raises(HTTPException) as exc:
            await upsert_admin(
                db_session, email="jefe@empresa.com", full_name="Jefe", password="corta"
            )
        assert exc.value.status_code == 422
        # No debe haber creado nada.
        assert await _count_users(db_session) == 0


class TestSetupStatus:
    async def test_false_on_empty_db(self, db_session):
        resp = await setup_status(db=db_session)
        assert resp.has_admin is False

    async def test_true_after_admin_created(self, db_session):
        await upsert_admin(
            db_session, email="jefe@empresa.com", full_name="Jefe", password="segura12345"
        )
        resp = await setup_status(db=db_session)
        assert resp.has_admin is True

    async def test_false_when_only_inactive_admin(self, db_session):
        from app.core.security import hash_password

        db_session.add(
            User(
                email="inactivo@empresa.com",
                hashed_password=hash_password("segura12345"),
                is_admin=True,
                is_active=False,
                must_change_password=False,
            )
        )
        await db_session.commit()
        resp = await setup_status(db=db_session)
        assert resp.has_admin is False

    async def test_false_when_only_non_admin_user(self, db_session):
        from app.core.security import hash_password

        db_session.add(
            User(
                email="normal@empresa.com",
                hashed_password=hash_password("segura12345"),
                is_admin=False,
                is_active=True,
                must_change_password=False,
            )
        )
        await db_session.commit()
        resp = await setup_status(db=db_session)
        assert resp.has_admin is False
