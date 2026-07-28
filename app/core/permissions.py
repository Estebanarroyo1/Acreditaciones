import enum

from fastapi import Depends, HTTPException

from app.core.auth import get_current_user
from app.models.user import User


class Module(str, enum.Enum):
    trabajadores = "trabajadores"
    vehiculos = "vehiculos"
    gastos = "gastos"
    configuracion = "configuracion"
    reportes = "reportes"


class PermissionLevel(str, enum.Enum):
    read = "read"
    write = "write"


_LEVEL_RANK = {PermissionLevel.read: 0, PermissionLevel.write: 1}


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Se requieren permisos de administrador.")
    return current_user


def require_module(module: Module, level: PermissionLevel):
    async def _check(current_user: User = Depends(get_current_user)) -> User:
        if current_user.is_admin:
            return current_user
        for perm in current_user.permissions:
            if perm.module == module.value:
                user_level = PermissionLevel(perm.level)
                if _LEVEL_RANK[user_level] >= _LEVEL_RANK[level]:
                    return current_user
        raise HTTPException(
            status_code=403,
            detail=f"Permiso insuficiente: se requiere '{level.value}' en módulo '{module.value}'.",
        )

    return _check
