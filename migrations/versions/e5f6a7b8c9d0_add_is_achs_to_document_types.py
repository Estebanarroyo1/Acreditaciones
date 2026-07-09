"""add is_achs and achs_category to document_types

Revision ID: e5f6a7b8c9d0
Revises: 410ba75f9f0a
Create Date: 2026-07-08 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'e5f6a7b8c9d0'
down_revision = '410ba75f9f0a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'document_types',
        sa.Column('is_achs', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        'document_types',
        sa.Column('achs_category', sa.String(20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('document_types', 'achs_category')
    op.drop_column('document_types', 'is_achs')
