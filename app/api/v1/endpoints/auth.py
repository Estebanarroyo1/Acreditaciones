from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import create_access_token, get_current_user
from app.core.permissions import Module, PermissionLevel, require_admin
from app.core.security import hash_password, validate_password_strength, verify_password
from app.db.session import get_db
from app.models.user import ModulePermission, User
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    PasswordReset,
    PermissionItem,
    PermissionsReplace,
    SetupStatus,
    UserCreate,
    UserPatch,
    UserRead,
)
from app.services.users import active_admin_exists

router = APIRouter(tags=["auth"])


@router.get("/auth/setup-status", response_model=SetupStatus)
async def setup_status(db: AsyncSession = Depends(get_db)) -> SetupStatus:
    """Público (sin auth): indica si ya existe al menos un admin activo.

    Permite al frontend mostrar una pantalla de "no hay administradores, contacta
    al operador" cuando la base está vacía. NO expone ningún dato sensible.
    """
    return SetupStatus(has_admin=await active_admin_exists(db))


async def _count_active_admins(db: AsyncSession, *, exclude_id: int | None = None) -> int:
    """Cuenta administradores activos, opcionalmente excluyendo un id.

    Se usa para impedir que el sistema se quede sin ningún administrador activo.
    """
    stmt = select(func.count()).select_from(User).where(User.is_admin, User.is_active)
    if exclude_id is not None:
        stmt = stmt.where(User.id != exclude_id)
    result = await db.execute(stmt)
    return result.scalar_one()


async def _load_user_with_permissions(db: AsyncSession, user_id: int) -> User | None:
    result = await db.execute(
        select(User).where(User.id == user_id).options(selectinload(User.permissions))
    )
    return result.scalar_one_or_none()


@router.post("/auth/login", response_model=LoginResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)) -> LoginResponse:
    result = await db.execute(
        select(User).where(User.email == body.email.lower()).options(selectinload(User.permissions))
    )
    user = result.scalar_one_or_none()

    # Mensaje genérico: no revelamos si falló el correo o la contraseña. Verificamos
    # la contraseña incluso sin usuario no es posible sin el hash, pero verify_password
    # sobre un usuario inexistente no aplica; el mensaje único evita enumeración.
    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos.")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Usuario desactivado.")

    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user)
    return LoginResponse(
        access_token=token,
        must_change_password=user.must_change_password,
        user=UserRead.model_validate(user),
    )


@router.post("/auth/change-password", response_model=UserRead)
async def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    # Funciona incluso con must_change_password=True: es la única acción permitida
    # en ese estado (get_current_user no bloquea por ese flag).
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=401, detail="La contraseña actual es incorrecta.")

    validate_password_strength(body.new_password)

    current_user.hashed_password = hash_password(body.new_password)
    current_user.must_change_password = False
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.get("/auth/me", response_model=UserRead)
async def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.post("/admin/users", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> User:
    email = body.email.lower()

    existing = await db.execute(select(User.id).where(User.email == email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Ya existe un usuario con ese correo.")

    validate_password_strength(body.password)

    if body.permissions:
        valid_modules = {m.value for m in Module}
        valid_levels = {lv.value for lv in PermissionLevel}
        _validate_permissions(body.permissions, valid_modules, valid_levels)

    user = User(
        email=email,
        full_name=body.full_name,
        hashed_password=hash_password(body.password),
        is_admin=body.is_admin,
        is_active=True,
        # El admin define la contraseña inicial; el usuario debe cambiarla al entrar.
        must_change_password=True,
    )
    db.add(user)
    await db.flush()  # asigna user.id para los permisos

    if body.permissions:
        for item in body.permissions:
            db.add(ModulePermission(user_id=user.id, module=item.module, level=item.level))

    await db.commit()
    created = await _load_user_with_permissions(db, user.id)
    return created


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
    user = await _load_user_with_permissions(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    if user.id == current_user.id and (body.is_admin is False or body.is_active is False):
        raise HTTPException(
            status_code=403,
            detail="No puedes quitarte el rol de administrador ni desactivarte a ti mismo.",
        )

    # Protección del último admin: si el cambio dejaría al usuario sin ser admin
    # activo y no queda ningún otro admin activo, se rechaza (evita quedarse sin
    # administradores). Cubre casos que la protección de "sí mismo" no alcanza
    # (p. ej. en AUTH_DISABLED el current_user es un stub id=-1 fuera de la BD).
    will_be_admin = body.is_admin if body.is_admin is not None else user.is_admin
    will_be_active = body.is_active if body.is_active is not None else user.is_active
    was_active_admin = user.is_admin and user.is_active
    if was_active_admin and not (will_be_admin and will_be_active):
        others = await _count_active_admins(db, exclude_id=user.id)
        if others == 0:
            raise HTTPException(
                status_code=409,
                detail="No puedes desactivar ni quitar admin al último administrador activo.",
            )

    if body.full_name is not None:
        user.full_name = body.full_name
    if body.is_admin is not None:
        user.is_admin = body.is_admin
    if body.is_active is not None:
        user.is_active = body.is_active

    await db.commit()
    await db.refresh(user)
    return user


@router.post("/admin/users/{user_id}/reset-password", response_model=UserRead)
async def reset_password(
    user_id: int,
    body: PasswordReset,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> User:
    user = await _load_user_with_permissions(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    validate_password_strength(body.new_password)

    user.hashed_password = hash_password(body.new_password)
    # Se fuerza el cambio para que el usuario defina su propia contraseña al entrar.
    user.must_change_password = True
    await db.commit()
    await db.refresh(user)
    return user


@router.delete("/admin/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> Response:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    if user.id == current_user.id:
        raise HTTPException(status_code=403, detail="No puedes eliminarte a ti mismo.")

    if user.is_admin and user.is_active:
        others = await _count_active_admins(db, exclude_id=user.id)
        if others == 0:
            raise HTTPException(
                status_code=409,
                detail="No puedes eliminar al último administrador activo.",
            )

    # Los permisos por módulo se borran por cascade (ondelete="CASCADE"). No hay
    # otras FKs hacia users (no existe created_by/updated_by en el esquema).
    await db.delete(user)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
