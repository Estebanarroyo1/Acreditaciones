import logging
from datetime import datetime, timezone

import jwt
from jwt import PyJWKClient
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.models.user import User

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=False)
_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        url = (
            f"https://login.microsoftonline.com/"
            f"{settings.ENTRA_TENANT_ID}/discovery/v2.0/keys"
        )
        _jwks_client = PyJWKClient(url, cache_keys=True)
    return _jwks_client


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    if settings.AUTH_DISABLED:
        stub = User(
            id=-1,
            entra_oid="dev-oid",
            email="dev@localhost",
            full_name="Dev User (AUTH_DISABLED)",
            is_admin=True,
            is_active=True,
        )
        return stub

    if credentials is None:
        raise HTTPException(status_code=401, detail="No autenticado.")

    token = credentials.credentials
    try:
        client = _get_jwks_client()
        signing_key = client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=[settings.ENTRA_CLIENT_ID, f"api://{settings.ENTRA_CLIENT_ID}"],
            issuer=f"https://login.microsoftonline.com/{settings.ENTRA_TENANT_ID}/v2.0",
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado.")
    except jwt.InvalidTokenError as exc:
        # El detalle interno (motivo exacto del fallo) solo se loggea; nunca se
        # devuelve al cliente para no filtrar información de la validación.
        logger.warning("Token JWT inválido: %s", exc)
        raise HTTPException(status_code=401, detail="Token inválido o expirado.")

    oid: str | None = payload.get("oid")
    email: str = payload.get("email") or payload.get("preferred_username") or ""
    name: str = payload.get("name") or email

    if not oid:
        raise HTTPException(status_code=401, detail="Token no contiene el claim 'oid'.")

    result = await db.execute(select(User).where(User.entra_oid == oid))
    user = result.scalar_one_or_none()

    if user is None:
        admin_set = {e.strip().lower() for e in settings.ADMIN_EMAILS.split(",") if e.strip()}
        user = User(
            entra_oid=oid,
            email=email,
            full_name=name,
            is_admin=email.lower() in admin_set,
            is_active=True,
        )
        db.add(user)
        await db.flush()

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Usuario desactivado.")

    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)
    return user
