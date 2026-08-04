"""Unit tests for permission dependency logic (no DB required)."""
import pytest
from fastapi import HTTPException

from app.core.permissions import Module, PermissionLevel, require_admin, require_module
from app.models.user import ModulePermission, User


def _user(*, is_admin: bool = False, permissions: list[ModulePermission] | None = None) -> User:
    u = User(id=1, email="test@test.com", hashed_password="x", is_admin=is_admin, is_active=True)
    u.permissions = permissions or []
    return u


def _perm(module: str, level: str) -> ModulePermission:
    return ModulePermission(user_id=1, module=module, level=level)


class TestRequireAdmin:
    async def test_admin_user_passes(self):
        user = _user(is_admin=True)
        result = await require_admin(current_user=user)
        assert result is user

    async def test_non_admin_raises_403(self):
        user = _user(is_admin=False)
        with pytest.raises(HTTPException) as exc_info:
            await require_admin(current_user=user)
        assert exc_info.value.status_code == 403


class TestRequireModule:
    async def test_admin_bypasses_all_checks(self):
        user = _user(is_admin=True)
        check = require_module(Module.trabajadores, PermissionLevel.write)
        result = await check(current_user=user)
        assert result is user

    async def test_write_permission_satisfies_write_requirement(self):
        user = _user(permissions=[_perm("trabajadores", "write")])
        check = require_module(Module.trabajadores, PermissionLevel.write)
        result = await check(current_user=user)
        assert result is user

    async def test_write_permission_satisfies_read_requirement(self):
        user = _user(permissions=[_perm("trabajadores", "write")])
        check = require_module(Module.trabajadores, PermissionLevel.read)
        result = await check(current_user=user)
        assert result is user

    async def test_read_permission_does_not_satisfy_write_requirement(self):
        user = _user(permissions=[_perm("trabajadores", "read")])
        check = require_module(Module.trabajadores, PermissionLevel.write)
        with pytest.raises(HTTPException) as exc_info:
            await check(current_user=user)
        assert exc_info.value.status_code == 403

    async def test_no_permissions_raises_403(self):
        user = _user(permissions=[])
        check = require_module(Module.trabajadores, PermissionLevel.read)
        with pytest.raises(HTTPException) as exc_info:
            await check(current_user=user)
        assert exc_info.value.status_code == 403

    async def test_permission_for_different_module_raises_403(self):
        user = _user(permissions=[_perm("vehiculos", "write")])
        check = require_module(Module.trabajadores, PermissionLevel.read)
        with pytest.raises(HTTPException) as exc_info:
            await check(current_user=user)
        assert exc_info.value.status_code == 403

    async def test_multiple_modules_correct_one_grants_access(self):
        user = _user(permissions=[
            _perm("vehiculos", "write"),
            _perm("trabajadores", "read"),
        ])
        check = require_module(Module.trabajadores, PermissionLevel.read)
        result = await check(current_user=user)
        assert result is user
