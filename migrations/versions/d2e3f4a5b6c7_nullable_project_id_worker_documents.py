"""make worker_documents.project_id nullable for global docs

Revision ID: d2e3f4a5b6c7
Revises: c1d4e5f6a7b8
Create Date: 2026-06-15 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'd2e3f4a5b6c7'
down_revision = 'c1d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        'worker_documents',
        'project_id',
        existing_type=sa.Integer(),
        nullable=True,
    )


def downgrade() -> None:
    # Rows with project_id IS NULL must be handled before downgrading
    op.execute("DELETE FROM worker_documents WHERE project_id IS NULL")
    op.alter_column(
        'worker_documents',
        'project_id',
        existing_type=sa.Integer(),
        nullable=False,
    )
