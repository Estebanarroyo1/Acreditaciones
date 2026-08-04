"""add AI validation audit fields to worker_documents and vehicle_documents

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-07-28

Auditoría del override de validación por IA (filosofía silencio/aviso/confirmación):
- worker_documents.validation_override_used (bool, default False) + validation_notes (text)
- vehicle_documents.type_override_used     (bool, default False) + validation_notes (text)

Los bool se agregan con server_default false para respaldar filas existentes y luego
se retira el default (lo controla la aplicación). validation_notes es nullable.
"""

import sqlalchemy as sa
from alembic import op

revision = "f2a3b4c5d6e7"
down_revision = "e1f2a3b4c5d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "worker_documents",
        sa.Column("validation_override_used", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("worker_documents", sa.Column("validation_notes", sa.Text(), nullable=True))
    op.alter_column("worker_documents", "validation_override_used", server_default=None)

    op.add_column(
        "vehicle_documents",
        sa.Column("type_override_used", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("vehicle_documents", sa.Column("validation_notes", sa.Text(), nullable=True))
    op.alter_column("vehicle_documents", "type_override_used", server_default=None)


def downgrade() -> None:
    op.drop_column("vehicle_documents", "validation_notes")
    op.drop_column("vehicle_documents", "type_override_used")
    op.drop_column("worker_documents", "validation_notes")
    op.drop_column("worker_documents", "validation_override_used")
