"""add_dates_from_ai_to_worker_documents

Revision ID: a1b2c3d4e5f6
Revises: ef17c1539e20
Create Date: 2026-07-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'ef17c1539e20'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'worker_documents',
        sa.Column('dates_from_ai', sa.Boolean(), nullable=False, server_default='false'),
    )


def downgrade() -> None:
    op.drop_column('worker_documents', 'dates_from_ai')
