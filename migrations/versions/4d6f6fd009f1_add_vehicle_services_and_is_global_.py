"""add_vehicle_services_and_is_global_requirement

Revision ID: 4d6f6fd009f1
Revises: d3e4f5a6b7c8
Create Date: 2026-07-06 15:52:19.422993

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '4d6f6fd009f1'
down_revision: Union[str, None] = 'd3e4f5a6b7c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('vehicle_services',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('name')
    )
    op.create_index(op.f('ix_vehicle_services_id'), 'vehicle_services', ['id'], unique=False)
    op.create_table('vehicle_service_document_types',
    sa.Column('vehicle_service_id', sa.Integer(), nullable=False),
    sa.Column('vehicle_document_type_id', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['vehicle_document_type_id'], ['vehicle_document_types.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['vehicle_service_id'], ['vehicle_services.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('vehicle_service_id', 'vehicle_document_type_id')
    )
    op.add_column('vehicle_document_types', sa.Column('is_global_requirement', sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('vehicles', sa.Column('vehicle_service_id', sa.Integer(), nullable=True))
    op.create_foreign_key(None, 'vehicles', 'vehicle_services', ['vehicle_service_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    op.drop_constraint(None, 'vehicles', type_='foreignkey')
    op.drop_column('vehicles', 'vehicle_service_id')
    op.drop_column('vehicle_document_types', 'is_global_requirement')
    op.drop_table('vehicle_service_document_types')
    op.drop_index(op.f('ix_vehicle_services_id'), table_name='vehicle_services')
    op.drop_table('vehicle_services')
