"""replace entra auth with local email+password auth

Revision ID: a3b4c5d6e7f8
Revises: f2a3b4c5d6e7
Create Date: 2026-08-04

Reemplaza la autenticación Microsoft Entra ID por autenticación local:
- ELIMINA la columna `users.entra_oid` (y su índice único).
- AGREGA `users.hashed_password` (bcrypt) NOT NULL.
- AGREGA `users.must_change_password` NOT NULL (default True).

Camino elegido para datos existentes (cuentas creadas vía Entra, sin contraseña):
`hashed_password` se agrega primero como NULLABLE, se rellena en las filas
existentes con un marcador NO verificable (`LOCKED_NO_PASSWORD`) y recién
entonces se vuelve NOT NULL. Ese marcador no es un hash bcrypt válido, así que
`verify_password` lo rechaza (devuelve False) y esas cuentas NO pueden iniciar
sesión: deben recrearse con el comando de bootstrap. Esto mantiene la migración
segura tanto en una tabla vacía como con datos, sin dejar contraseñas usables.

`must_change_password` se agrega con server_default=true para respaldar filas
existentes y luego se retira, dejando el default en manos del modelo (default=True).

Downgrade: es lossy (los `entra_oid` originales no se pueden recuperar). Restaura
la columna `entra_oid` como nullable y elimina las columnas nuevas.
"""

import sqlalchemy as sa
from alembic import op

revision = "a3b4c5d6e7f8"
down_revision = "f2a3b4c5d6e7"
branch_labels = None
depends_on = None

# Marcador NO verificable para cuentas heredadas de Entra (sin contraseña). No es
# un hash bcrypt válido → verify_password() devuelve False → login imposible.
_LOCKED_MARKER = "LOCKED_NO_PASSWORD"


def upgrade() -> None:
    # 1) hashed_password: se agrega nullable para poder rellenar filas existentes.
    op.add_column("users", sa.Column("hashed_password", sa.String(length=255), nullable=True))
    op.execute(
        sa.text("UPDATE users SET hashed_password = :m WHERE hashed_password IS NULL").bindparams(
            m=_LOCKED_MARKER
        )
    )
    op.alter_column("users", "hashed_password", nullable=False)

    # 2) must_change_password: server_default para filas existentes, luego se retira.
    op.add_column(
        "users",
        sa.Column(
            "must_change_password",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.alter_column("users", "must_change_password", server_default=None)

    # 3) Eliminar la autenticación Entra.
    op.drop_index(op.f("ix_users_entra_oid"), table_name="users")
    op.drop_column("users", "entra_oid")


def downgrade() -> None:
    # entra_oid original es irrecuperable → se restaura como nullable.
    op.add_column("users", sa.Column("entra_oid", sa.String(length=36), nullable=True))
    op.create_index(op.f("ix_users_entra_oid"), "users", ["entra_oid"], unique=True)
    op.drop_column("users", "must_change_password")
    op.drop_column("users", "hashed_password")
