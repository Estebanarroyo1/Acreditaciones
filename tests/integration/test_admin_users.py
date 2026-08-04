"""Integration tests — administración de usuarios por un admin (flujo local).

Se llaman las funciones de endpoint directamente con una sesión SQLite en memoria
(mismo estilo que el resto de la suite). `require_admin`/`get_current_user` no se
ejercitan aquí: el `current_user` admin se pasa explícitamente.
"""

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.api.v1.endpoints.auth import (
    create_user,
    delete_user,
    list_users,
    patch_user,
    reset_password,
)
from app.core.security import hash_password, verify_password
from app.models.user import ModulePermission, User
from app.schemas.auth import PasswordReset, PermissionItem, UserCreate, UserPatch, UserRead


def _admin_stub() -> User:
    """Admin ficticio (estilo AUTH_DISABLED, id=-1) que actúa como current_user.

    No está en la BD, así que no cuenta como admin activo del sistema.
    """
    return User(id=-1, email="stub@localhost", hashed_password="", is_admin=True, is_active=True)


async def _add_user(
    db,
    *,
    email: str,
    password: str = "inicial123",
    is_admin: bool = False,
    is_active: bool = True,
) -> User:
    user = User(
        email=email.lower(),
        hashed_password=hash_password(password),
        full_name="X",
        is_admin=is_admin,
        is_active=is_active,
        must_change_password=False,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


class TestCreateUser:
    async def test_create_success(self, db_session):
        body = UserCreate(
            email="Nuevo@Company.com",
            full_name="Nuevo Usuario",
            password="segura12345",
            is_admin=False,
        )
        created = await create_user(body, db=db_session)
        assert created.email == "nuevo@company.com"  # normalizado a minúsculas
        assert created.must_change_password is True  # fuerza cambio en primer ingreso
        assert verify_password("segura12345", created.hashed_password) is True

    async def test_create_with_permissions(self, db_session):
        body = UserCreate(
            email="conperm@company.com",
            password="segura12345",
            permissions=[PermissionItem(module="trabajadores", level="write")],
        )
        created = await create_user(body, db=db_session)
        result = await db_session.execute(
            select(ModulePermission).where(ModulePermission.user_id == created.id)
        )
        perms = result.scalars().all()
        assert len(perms) == 1
        assert perms[0].module == "trabajadores"
        assert perms[0].level == "write"

    async def test_create_duplicate_email_409(self, db_session):
        await _add_user(db_session, email="dup@company.com")
        body = UserCreate(email="dup@company.com", password="segura12345")
        with pytest.raises(HTTPException) as exc:
            await create_user(body, db=db_session)
        assert exc.value.status_code == 409

    async def test_create_duplicate_email_case_insensitive_409(self, db_session):
        await _add_user(db_session, email="dup@company.com")
        body = UserCreate(email="DUP@company.com", password="segura12345")
        with pytest.raises(HTTPException) as exc:
            await create_user(body, db=db_session)
        assert exc.value.status_code == 409

    async def test_create_weak_password_422(self, db_session):
        body = UserCreate(email="weak@company.com", password="corta")
        with pytest.raises(HTTPException) as exc:
            await create_user(body, db=db_session)
        assert exc.value.status_code == 422

    async def test_create_invalid_permission_422(self, db_session):
        body = UserCreate(
            email="badperm@company.com",
            password="segura12345",
            permissions=[PermissionItem(module="inexistente", level="write")],
        )
        with pytest.raises(HTTPException) as exc:
            await create_user(body, db=db_session)
        assert exc.value.status_code == 422


class TestResetPassword:
    async def test_reset_success(self, db_session):
        user = await _add_user(db_session, email="reset@company.com", password="vieja12345")
        updated = await reset_password(
            user.id, PasswordReset(new_password="nueva67890"), db=db_session
        )
        assert updated.must_change_password is True
        assert verify_password("nueva67890", updated.hashed_password) is True
        assert verify_password("vieja12345", updated.hashed_password) is False

    async def test_reset_weak_password_422(self, db_session):
        user = await _add_user(db_session, email="reset2@company.com")
        with pytest.raises(HTTPException) as exc:
            await reset_password(user.id, PasswordReset(new_password="corta"), db=db_session)
        assert exc.value.status_code == 422

    async def test_reset_unknown_user_404(self, db_session):
        with pytest.raises(HTTPException) as exc:
            await reset_password(9999, PasswordReset(new_password="nueva67890"), db=db_session)
        assert exc.value.status_code == 404


class TestLastAdminProtection:
    async def test_deactivate_last_admin_409(self, db_session):
        admin = await _add_user(db_session, email="solo-admin@company.com", is_admin=True)
        with pytest.raises(HTTPException) as exc:
            await patch_user(
                admin.id, UserPatch(is_active=False), current_user=_admin_stub(), db=db_session
            )
        assert exc.value.status_code == 409

    async def test_remove_admin_from_last_admin_409(self, db_session):
        admin = await _add_user(db_session, email="solo-admin2@company.com", is_admin=True)
        with pytest.raises(HTTPException) as exc:
            await patch_user(
                admin.id, UserPatch(is_admin=False), current_user=_admin_stub(), db=db_session
            )
        assert exc.value.status_code == 409

    async def test_deactivate_admin_allowed_when_another_exists(self, db_session):
        await _add_user(db_session, email="admin-a@company.com", is_admin=True)
        admin_b = await _add_user(db_session, email="admin-b@company.com", is_admin=True)
        updated = await patch_user(
            admin_b.id, UserPatch(is_active=False), current_user=_admin_stub(), db=db_session
        )
        assert updated.is_active is False

    async def test_delete_last_admin_409(self, db_session):
        admin = await _add_user(db_session, email="solo-admin3@company.com", is_admin=True)
        with pytest.raises(HTTPException) as exc:
            await delete_user(admin.id, current_user=_admin_stub(), db=db_session)
        assert exc.value.status_code == 409

    async def test_delete_self_403(self, db_session):
        admin = await _add_user(db_session, email="yo@company.com", is_admin=True)
        # Otro admin para que no sea la protección de "último admin" la que actúe.
        await _add_user(db_session, email="otro-admin@company.com", is_admin=True)
        with pytest.raises(HTTPException) as exc:
            await delete_user(admin.id, current_user=admin, db=db_session)
        assert exc.value.status_code == 403

    async def test_delete_non_admin_succeeds(self, db_session):
        user = await _add_user(db_session, email="borrable@company.com", is_admin=False)
        await delete_user(user.id, current_user=_admin_stub(), db=db_session)
        gone = await db_session.get(User, user.id)
        assert gone is None


class TestPatchAndNoHashExposure:
    async def test_patch_full_name(self, db_session):
        user = await _add_user(db_session, email="rename@company.com")
        updated = await patch_user(
            user.id, UserPatch(full_name="Nombre Nuevo"), current_user=_admin_stub(), db=db_session
        )
        assert updated.full_name == "Nombre Nuevo"

    async def test_userread_never_exposes_hash(self, db_session):
        user = await _add_user(db_session, email="nohash@company.com")
        dumped = UserRead.model_validate(user).model_dump()
        assert "hashed_password" not in dumped

    async def test_list_users_no_hash(self, db_session):
        await _add_user(db_session, email="l1@company.com")
        users = await list_users(db=db_session)
        for u in users:
            dumped = UserRead.model_validate(u).model_dump()
            assert "hashed_password" not in dumped
