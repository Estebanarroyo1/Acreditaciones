"""Helpers de usuarios reutilizables (setup / bootstrap del primer admin)."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


async def active_admin_exists(db: AsyncSession) -> bool:
    """True si existe al menos un administrador **activo** (is_admin y is_active).

    Se usa para el endpoint `/auth/setup-status` (¿la app ya tiene un admin usable?)
    y como condición de bootstrap. Un admin desactivado no cuenta: no podría entrar.
    """
    stmt = select(func.count()).select_from(User).where(User.is_admin, User.is_active)
    result = await db.execute(stmt)
    return result.scalar_one() > 0
