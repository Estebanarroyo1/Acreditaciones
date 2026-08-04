"""
Crea (o promueve) el PRIMER administrador de la plataforma.

Necesario porque no existe autenticación externa (SSO) ni auto-provisión de admins:
en una base vacía no habría forma de entrar. Este comando crea un usuario con
`is_admin=True` e `is_active=True` a partir de credenciales que define el operador.

Uso (desde C:\\Acreditaciones con el .venv activo):
    .venv\\Scripts\\python.exe -m scripts.create_admin
    .venv\\Scripts\\python.exe -m scripts.create_admin --email jefe@empresa.com --full-name "Jefe"
    # No interactivo (CI/automatización): pasar la contraseña por variable de entorno
    #   set ADMIN_EMAIL / ADMIN_FULL_NAME / ADMIN_PASSWORD  y agregar --yes

Resolución de cada dato: argumento CLI > variable de entorno > prompt interactivo.
Variables: ADMIN_EMAIL, ADMIN_FULL_NAME, ADMIN_PASSWORD.

Decisión de diseño — `must_change_password=False`: el operador define la
contraseña él mismo en consola, así que NO se le fuerza a cambiarla en el primer
ingreso (a diferencia de los usuarios creados por un admin vía `/admin/users`, que
sí llevan `must_change_password=True`).

Seguridad: la contraseña se pide con `getpass` (no se hace eco), nunca se imprime
ni se registra en logs.
"""

import argparse
import asyncio
import getpass
import os
import sys

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, validate_password_strength
from app.db.session import AsyncSessionLocal
from app.models.user import User


async def upsert_admin(
    db: AsyncSession, *, email: str, full_name: str | None, password: str
) -> tuple[User, bool]:
    """Crea el admin o, si el email ya existe, lo promueve a admin y le resetea la
    contraseña. Idempotente. Devuelve `(user, created)`.

    Valida la fuerza de la contraseña (lanza HTTPException 422 si no cumple).
    """
    validate_password_strength(password)
    email = email.strip().lower()

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    created = user is None

    if user is None:
        user = User(
            email=email,
            full_name=full_name,
            hashed_password=hash_password(password),
            is_admin=True,
            is_active=True,
            must_change_password=False,
        )
        db.add(user)
    else:
        user.is_admin = True
        user.is_active = True
        user.hashed_password = hash_password(password)
        user.must_change_password = False
        if full_name:
            user.full_name = full_name

    await db.commit()
    await db.refresh(user)
    return user, created


def _err(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)


async def _run(
    email: str, full_name: str | None, password: str, *, assume_yes: bool, interactive: bool
) -> int:
    async with AsyncSessionLocal() as db:
        existing = await db.execute(select(User.id).where(User.email == email.strip().lower()))
        already = existing.scalar_one_or_none() is not None

        if already and not assume_yes:
            if interactive:
                ans = (
                    input(
                        f"Ya existe un usuario '{email}'. ¿Convertirlo en admin y "
                        f"resetear su contraseña? [y/N]: "
                    )
                    .strip()
                    .lower()
                )
                if ans not in ("y", "yes", "s", "si", "sí"):
                    print("Operación cancelada.")
                    return 1
            else:
                _err(
                    f"ya existe un usuario '{email}'. Reejecuta con --yes para "
                    f"promoverlo a admin y resetear su contraseña."
                )
                return 3

        try:
            user, created = await upsert_admin(
                db, email=email, full_name=full_name, password=password
            )
        except HTTPException as exc:
            _err(str(exc.detail))
            return 2

        action = "creado" if created else "actualizado (promovido a admin + contraseña reseteada)"
        print(f"Administrador {action}: {user.email} (id={user.id}).")
        return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="python -m scripts.create_admin",
        description="Crea o promueve el primer administrador de la plataforma.",
    )
    parser.add_argument("--email", help="Email del administrador (o env ADMIN_EMAIL).")
    parser.add_argument("--full-name", help="Nombre completo (o env ADMIN_FULL_NAME).")
    parser.add_argument(
        "--password",
        help="INSEGURO en shell compartido: preferir el prompt o env ADMIN_PASSWORD.",
    )
    parser.add_argument(
        "-y",
        "--yes",
        action="store_true",
        help="No pedir confirmación si el usuario ya existe (para automatización).",
    )
    args = parser.parse_args()

    interactive = sys.stdin.isatty()

    email = args.email or os.environ.get("ADMIN_EMAIL")
    if not email and interactive:
        email = input("Email del administrador: ").strip()
    if not email:
        _err("falta el email (arg --email o env ADMIN_EMAIL).")
        return 2

    full_name = args.full_name or os.environ.get("ADMIN_FULL_NAME")
    if full_name is None and interactive:
        full_name = input("Nombre completo (opcional): ").strip() or None

    password = args.password or os.environ.get("ADMIN_PASSWORD")
    if not password:
        if interactive:
            password = getpass.getpass("Contraseña: ")
            confirm = getpass.getpass("Repite la contraseña: ")
            if password != confirm:
                _err("las contraseñas no coinciden.")
                return 2
        else:
            _err("falta la contraseña (arg --password o env ADMIN_PASSWORD).")
            return 2

    # Validación temprana con mensaje amable (antes de tocar la BD).
    try:
        validate_password_strength(password)
    except HTTPException as exc:
        _err(str(exc.detail))
        return 2

    return asyncio.run(
        _run(email, full_name, password, assume_yes=args.yes, interactive=interactive)
    )


if __name__ == "__main__":
    # asyncpg puede fallar con el ProactorEventLoop de Windows; forzamos el selector.
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    sys.exit(main())
