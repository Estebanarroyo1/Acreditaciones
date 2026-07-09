"""add_ai_fields_to_vehicle_documents

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-07-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c2d3e4f5a6b7'
down_revision: Union[str, None] = 'b1c2d3e4f5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'vehicle_documents',
        sa.Column('ai_extracted', sa.Boolean(), nullable=False, server_default='false'),
    )
    op.add_column(
        'vehicle_documents',
        sa.Column('ai_document_type_detected', sa.String(150), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('vehicle_documents', 'ai_document_type_detected')
    op.drop_column('vehicle_documents', 'ai_extracted')
