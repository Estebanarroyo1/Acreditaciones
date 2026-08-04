"""Autenticación local: JWT HS256 firmado por la propia aplicación.

El access token lleva `sub` = id del usuario y `exp`. `get_current_user` valida
la firma y expiración, carga el `User` desde la BD y verifica que esté activo.
"""

import logging
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.models.user import User

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=False)

ALGORITHM = "HS256"


def _dev_stub_user() -> User:
    """Usuario admin ficticio para AUTH_DISABLED (solo desarrollo).

    id=-1 nunca colisiona con filas reales (PK autoincremental positiva). El
    candado de producción impide arrancar con AUTH_DISABLED=true, así que este
    stub jamás corre en producción.
    """
    return User(
        id=-1,
        email="dev@localhost",
        hashed_password="",  # sin uso: en AUTH_DISABLED no se verifica contraseña
        full_name="Dev User (AUTH_DISABLED)",
        is_admin=True,
        is_active=True,
        must_change_password=False,
    )


def create_access_token(user: User) -> str:
    """Genera un access token HS256 con `sub`=id del usuario y `exp` configurable."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(user.id), "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    if settings.AUTH_DISABLED:
        return _dev_stub_user()

    if credentials is None:
        raise HTTPException(status_code=401, detail="Token inválido o expirado.")

    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado.")
    except jwt.InvalidTokenError as exc:
        # El motivo exacto solo se loggea; nunca se filtra al cliente.
        logger.warning("Token JWT inválido: %s", exc)
        raise HTTPException(status_code=401, detail="Token inválido o expirado.")

    sub = payload.get("sub")
    try:
        user_id = int(sub)
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Token inválido o expirado.")

    user = await db.get(User, user_id)
    if user is None:
        # El usuario fue eliminado tras emitirse el token: se trata como no autenticado.
        raise HTTPException(status_code=401, detail="Token inválido o expirado.")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Usuario desactivado.")

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Alias explícito de `get_current_user` (que ya exige is_active).

    Se conserva por claridad en endpoints que quieran documentar el requisito.
    """
    return current_user
