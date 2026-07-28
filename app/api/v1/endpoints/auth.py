from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_user
from app.core.permissions import Module, PermissionLevel, require_admin
from app.db.session import get_db
from app.models.user import ModulePermission, User
from app.schemas.auth import PermissionItem, PermissionsReplace, UserPatch, UserRead

router = APIRouter(tags=["auth"])


@router.get("/auth/me", response_model=UserRead)
async def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.get("/admin/users", response_model=list[UserRead])
async def list_users(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[User]:
    result = await db.execute(select(User).options(selectinload(User.permissions)))
    return list(result.scalars().all())


@router.patch("/admin/users/{user_id}", response_model=UserRead)
async def patch_user(
    user_id: int,
    body: UserPatch,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> User:
    result = await db.execute(
        select(User).where(User.id == user_id).options(selectinload(User.permissions))
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    if user.id == current_user.id and (body.is_admin is False or body.is_active is False):
        raise HTTPException(
            status_code=403,
            detail="No puedes quitarte el rol de administrador ni desactivarte a ti mismo.",
        )

    if body.is_admin is not None:
        user.is_admin = body.is_admin
    if body.is_active is not None:
        user.is_active = body.is_active

    await db.commit()
    await db.refresh(user)
    return user


@router.put("/admin/users/{user_id}/permissions", response_model=UserRead)
async def replace_permissions(
    user_id: int,
    body: PermissionsReplace,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> User:
    result = await db.execute(
        select(User).where(User.id == user_id).options(selectinload(User.permissions))
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    valid_modules = {m.value for m in Module}
    valid_levels = {lv.value for lv in PermissionLevel}
    _validate_permissions(body.permissions, valid_modules, valid_levels)

    for perm in list(user.permissions):
        await db.delete(perm)
    await db.flush()

    for item in body.permissions:
        db.add(ModulePermission(user_id=user.id, module=item.module, level=item.level))

    await db.commit()
    await db.refresh(user)
    return user


def _validate_permissions(
    items: list[PermissionItem],
    valid_modules: set[str],
    valid_levels: set[str],
) -> None:
    for item in items:
        if item.module not in valid_modules:
            raise HTTPException(status_code=422, detail=f"Módulo inválido: '{item.module}'.")
        if item.level not in valid_levels:
            raise HTTPException(status_code=422, detail=f"Nivel inválido: '{item.level}'.")
