"""add_fleet_machinery_tables

Revision ID: b1c2d3e4f5a6
Revises: a1b2c3d4e5f6
Create Date: 2026-07-02 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'b1c2d3e4f5a6'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. vehicles
    op.create_table(
        'vehicles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('type', sa.String(length=100), nullable=False),
        sa.Column('brand', sa.String(length=100), nullable=False),
        sa.Column('model', sa.String(length=100), nullable=False),
        sa.Column('year', sa.Integer(), nullable=True),
        sa.Column('engine_number', sa.String(length=100), nullable=True),
        sa.Column('vin_chassis', sa.String(length=100), nullable=True),
        sa.Column('owners', sa.Text(), nullable=True),
        sa.Column('municipality', sa.String(length=150), nullable=True),
        sa.Column('license_plate', sa.String(length=20), nullable=False),
        sa.Column('insurance_company', sa.String(length=150), nullable=True),
        sa.Column('insurance_policy_number', sa.String(length=100), nullable=True),
        sa.Column('tag_id', sa.String(length=100), nullable=True),
        sa.Column('gps_id', sa.String(length=100), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('license_plate', name='uq_vehicles_license_plate'),
    )
    op.create_index('ix_vehicles_id', 'vehicles', ['id'])
    op.create_index('ix_vehicles_license_plate', 'vehicles', ['license_plate'], unique=True)

    # 2. vehicle_document_types
    op.create_table(
        'vehicle_document_types',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('validity_days', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('alert_percentage_override', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name', name='uq_vehicle_document_types_name'),
    )
    op.create_index('ix_vehicle_document_types_id', 'vehicle_document_types', ['id'])

    # 3. vehicle_documents — reuses existing documentstatus enum (create_type=False)
    op.create_table(
        'vehicle_documents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('vehicle_id', sa.Integer(), nullable=False),
        sa.Column('vehicle_document_type_id', sa.Integer(), nullable=False),
        sa.Column('file_path', sa.String(length=512), nullable=False),
        sa.Column('original_filename', sa.String(length=255), nullable=False),
        sa.Column('file_size_bytes', sa.Integer(), nullable=True),
        sa.Column('mime_type', sa.String(length=100), nullable=True),
        sa.Column('upload_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('issue_date', sa.Date(), nullable=True),
        sa.Column('expiry_date', sa.Date(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='uploaded'),
        sa.Column('reviewer_notes', sa.Text(), nullable=True),
        sa.Column('custom_alert_percentage', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['vehicle_document_type_id'], ['vehicle_document_types.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_vehicle_documents_id', 'vehicle_documents', ['id'])
    op.create_index('ix_vehicle_documents_vehicle_id', 'vehicle_documents', ['vehicle_id'])
    op.create_index('ix_vehicle_documents_vehicle_document_type_id', 'vehicle_documents', ['vehicle_document_type_id'])
    op.create_index('ix_vehicle_documents_expiry_date', 'vehicle_documents', ['expiry_date'])
    op.create_index('ix_vehicle_documents_status', 'vehicle_documents', ['status'])

    # 4. vehicle_maintenances — new measurementunit enum
    op.execute(sa.text("CREATE TYPE measurementunit AS ENUM ('km', 'horas')"))

    op.create_table(
        'vehicle_maintenances',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('vehicle_id', sa.Integer(), nullable=False),
        sa.Column('maintenance_program', sa.String(length=200), nullable=False),
        sa.Column('measurement_unit', postgresql.ENUM(name='measurementunit', create_type=False), nullable=False),
        sa.Column('last_service_date', sa.Date(), nullable=True),
        sa.Column('last_service_meter', sa.Float(), nullable=True),
        sa.Column('next_service_meter', sa.Float(), nullable=False),
        sa.Column('current_meter', sa.Float(), nullable=False, server_default='0'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_vehicle_maintenances_id', 'vehicle_maintenances', ['id'])
    op.create_index('ix_vehicle_maintenances_vehicle_id', 'vehicle_maintenances', ['vehicle_id'])


def downgrade() -> None:
    op.drop_table('vehicle_maintenances')
    op.execute("DROP TYPE IF EXISTS measurementunit")
    op.drop_table('vehicle_documents')
    op.drop_table('vehicle_document_types')
    op.drop_table('vehicles')
