"""vehicle_docs_days_based_alerts

Replaces percentage-based alert fields in vehicle tables with fixed-day
thresholds and adds the vehicle_global_alert_days system setting key.

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-07-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd3e4f5a6b7c8'
down_revision: Union[str, None] = 'c2d3e4f5a6b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # vehicle_document_types: alert_percentage_override → alert_days_override
    op.alter_column(
        'vehicle_document_types',
        'alert_percentage_override',
        new_column_name='alert_days_override',
        existing_type=sa.Integer(),
        existing_nullable=True,
    )

    # vehicle_documents: custom_alert_percentage → custom_alert_days
    op.alter_column(
        'vehicle_documents',
        'custom_alert_percentage',
        new_column_name='custom_alert_days',
        existing_type=sa.Integer(),
        existing_nullable=True,
    )

    # Seed default vehicle alert days in system_settings (idempotent via ON CONFLICT)
    op.execute(
        "INSERT INTO system_settings (key, value, updated_at) "
        "VALUES ('vehicle_global_alert_days', '30', now()) "
        "ON CONFLICT (key) DO NOTHING"
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM system_settings WHERE key = 'vehicle_global_alert_days'"
    )

    op.alter_column(
        'vehicle_documents',
        'custom_alert_days',
        new_column_name='custom_alert_percentage',
        existing_type=sa.Integer(),
        existing_nullable=True,
    )

    op.alter_column(
        'vehicle_document_types',
        'alert_days_override',
        new_column_name='alert_percentage_override',
        existing_type=sa.Integer(),
        existing_nullable=True,
    )
