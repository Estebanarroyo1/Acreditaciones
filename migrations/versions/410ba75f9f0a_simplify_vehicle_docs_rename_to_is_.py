"""simplify_vehicle_docs_rename_to_is_required_base

Revision ID: 410ba75f9f0a
Revises: 4d6f6fd009f1
Create Date: 2026-07-06 16:43:18.369500

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '410ba75f9f0a'
down_revision: Union[str, None] = '4d6f6fd009f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop FK from vehicles first (referencing vehicle_services)
    op.drop_constraint('vehicles_vehicle_service_id_fkey', 'vehicles', type_='foreignkey')
    op.drop_column('vehicles', 'vehicle_service_id')

    # Now remove vehicle services tables (no more dependent FKs)
    op.drop_table('vehicle_service_document_types')
    op.drop_index('ix_vehicle_services_id', table_name='vehicle_services')
    op.drop_table('vehicle_services')

    # Rename is_global_requirement → is_required_base (existing rows keep true)
    op.add_column('vehicle_document_types',
        sa.Column('is_required_base', sa.Boolean(), nullable=False, server_default='true'))
    op.drop_column('vehicle_document_types', 'is_global_requirement')

    # Drop leftover columns not in models
    op.drop_column('vehicle_documents', 'ai_document_type_detected')
    op.drop_column('vehicle_documents', 'ai_extracted')
    op.drop_column('worker_documents', 'dates_from_ai')


def downgrade() -> None:
    op.add_column('worker_documents',
        sa.Column('dates_from_ai', sa.BOOLEAN(), server_default=sa.text('false'), autoincrement=False, nullable=False))
    op.add_column('vehicles',
        sa.Column('vehicle_service_id', sa.INTEGER(), autoincrement=False, nullable=True))
    op.add_column('vehicle_documents',
        sa.Column('ai_extracted', sa.BOOLEAN(), server_default=sa.text('false'), autoincrement=False, nullable=False))
    op.add_column('vehicle_documents',
        sa.Column('ai_document_type_detected', sa.VARCHAR(length=150), autoincrement=False, nullable=True))
    op.add_column('vehicle_document_types',
        sa.Column('is_global_requirement', sa.BOOLEAN(), server_default=sa.text('true'), autoincrement=False, nullable=False))
    op.drop_column('vehicle_document_types', 'is_required_base')
    op.create_table('vehicle_services',
        sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
        sa.Column('name', sa.VARCHAR(length=200), autoincrement=False, nullable=False),
        sa.Column('description', sa.TEXT(), autoincrement=False, nullable=True),
        sa.Column('is_active', sa.BOOLEAN(), autoincrement=False, nullable=False),
        sa.Column('created_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=False),
        sa.Column('updated_at', postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=False),
        sa.PrimaryKeyConstraint('id', name='vehicle_services_pkey'),
        sa.UniqueConstraint('name', name='vehicle_services_name_key'),
    )
    op.create_index('ix_vehicle_services_id', 'vehicle_services', ['id'], unique=False)
    op.create_table('vehicle_service_document_types',
        sa.Column('vehicle_service_id', sa.INTEGER(), autoincrement=False, nullable=False),
        sa.Column('vehicle_document_type_id', sa.INTEGER(), autoincrement=False, nullable=False),
        sa.ForeignKeyConstraint(['vehicle_document_type_id'], ['vehicle_document_types.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['vehicle_service_id'], ['vehicle_services.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('vehicle_service_id', 'vehicle_document_type_id'),
    )
    op.create_foreign_key(
        'vehicles_vehicle_service_id_fkey', 'vehicles', 'vehicle_services',
        ['vehicle_service_id'], ['id'], ondelete='SET NULL')
