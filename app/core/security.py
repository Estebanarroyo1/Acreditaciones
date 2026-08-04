"""Hashing y validación de contraseñas para autenticación local.

Usa passlib con bcrypt. bcrypt solo considera los primeros 72 bytes de la
contraseña, por eso `validate_password_strength` acota el largo máximo. Nunca se
guarda la contraseña en claro: solo el hash devuelto por `hash_password`.
"""

import logging

from fastapi import HTTPException
from passlib.context import CryptContext

logger = logging.getLogger(__name__)

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# bcrypt opera sobre un máximo de 72 bytes; acotamos el largo para que la política
# sea explícita y no dependa del truncado silencioso de la librería.
MIN_PASSWORD_LENGTH = 10
MAX_PASSWORD_LENGTH = 72


def hash_password(plain: str) -> str:
    """Devuelve el hash bcrypt de la contraseña en claro."""
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """True si la contraseña en claro corresponde al hash.

    Es defensivo: un hash malformado o vacío (p. ej. cuentas antiguas migradas
    con un marcador de "sin contraseña") NO lanza — devuelve False, de modo que
    el login simplemente falla con un 401 genérico en vez de un 500.
    """
    try:
        return _pwd_context.verify(plain, hashed)
    except (ValueError, TypeError) as exc:
        logger.warning("verify_password: hash no verificable (%s)", exc)
        return False


def validate_password_strength(plain: str) -> None:
    """Valida una contraseña nueva. Lanza HTTPException 422 si no cumple.

    Requisitos: largo entre 10 y 72, al menos una letra y al menos un número.
    """
    if not (MIN_PASSWORD_LENGTH <= len(plain) <= MAX_PASSWORD_LENGTH):
        raise HTTPException(
            status_code=422,
            detail=(
                f"La contraseña debe tener entre {MIN_PASSWORD_LENGTH} y "
                f"{MAX_PASSWORD_LENGTH} caracteres."
            ),
        )
    if not any(c.isalpha() for c in plain):
        raise HTTPException(
            status_code=422,
            detail="La contraseña debe incluir al menos una letra.",
        )
    if not any(c.isdigit() for c in plain):
        raise HTTPException(
            status_code=422,
            detail="La contraseña debe incluir al menos un número.",
        )
