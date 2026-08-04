"""drop AI-related columns (validation toggle + override audit)

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
Create Date: 2026-08-04

Tras eliminar toda la validación/extracción con IA del backend, estas columnas
quedaron sin uso y se eliminan para dejar el esquema limpio:

- document_types.ai_validation_enabled
- vehicle_document_types.ai_validation_enabled
- worker_documents.validation_override_used
- worker_documents.validation_notes
- vehicle_documents.type_override_used
- vehicle_documents.validation_notes

Downgrade las recrea (los booleanos NOT NULL con server_default, luego retirado;
las notas como Text nullable).
"""

import sqlalchemy as sa
from alembic import op

revision = "b4c5d6e7f8a9"
down_revision = "a3b4c5d6e7f8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("document_types", "ai_validation_enabled")
    op.drop_column("vehicle_document_types", "ai_validation_enabled")
    op.drop_column("worker_documents", "validation_override_used")
    op.drop_column("worker_documents", "validation_notes")
    op.drop_column("vehicle_documents", "type_override_used")
    op.drop_column("vehicle_documents", "validation_notes")


def downgrade() -> None:
    # Booleanos NOT NULL: se agregan con server_default para respaldar filas
    # existentes y luego se retira el default (el valor lo controla la app).
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
        op.alter_column(table, "ai_validation_enabled", server_default=None)

    op.add_column(
        "worker_documents",
        sa.Column(
            "validation_override_used",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.alter_column("worker_documents", "validation_override_used", server_default=None)
    op.add_column("worker_documents", sa.Column("validation_notes", sa.Text(), nullable=True))

    op.add_column(
        "vehicle_documents",
        sa.Column(
            "type_override_used",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.alter_column("vehicle_documents", "type_override_used", server_default=None)
    op.add_column("vehicle_documents", sa.Column("validation_notes", sa.Text(), nullable=True))
