"""add ai_validation_enabled to document_types and vehicle_document_types

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-07-28

Permite activar/desactivar la validación con IA POR CADA TIPO de documento
(trabajadores y vehículos). Columna booleana NOT NULL con default True: los
tipos existentes conservan el comportamiento actual (IA activa). El server_default
se agrega solo para respaldar las filas existentes y luego se retira, dejando el
default en manos de la aplicación (el modelo ya declara default=True).
"""

import sqlalchemy as sa
from alembic import op

revision = "e1f2a3b4c5d6"
down_revision = "d0e1f2a3b4c5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("document_types", "vehicle_document_types"):
        op.add_column(
            table,
            sa.Column(
                "ai_validation_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            ),
        )
        # El default de aplicación (modelo) toma el control; quitamos el de BD.
        op.alter_column(table, "ai_validation_enabled", server_default=None)


def downgrade() -> None:
    op.drop_column("vehicle_document_types", "ai_validation_enabled")
    op.drop_column("document_types", "ai_validation_enabled")
