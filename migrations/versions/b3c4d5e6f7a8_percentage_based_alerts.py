"""percentage_based_alerts: add alert_percentage_override to document_types

Revision ID: b3c4d5e6f7a8
Revises: fa5c4bebc2bb
Create Date: 2026-06-24
"""
from alembic import op
import sqlalchemy as sa

revision = 'b3c4d5e6f7a8'
down_revision = 'fa5c4bebc2bb'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # New nullable column on document_types for per-type alert percentage override
    op.add_column(
        'document_types',
        sa.Column('alert_percentage_override', sa.Integer(), nullable=True),
    )
    # Migrate system_settings: replace the old threshold_days array key with
    # the new global_alert_percentage integer key (default 20 %).
    # Use raw SQL so this works even if the old row doesn't exist.
    op.execute(
        "DELETE FROM system_settings WHERE key = 'alert_threshold_days'"
    )
    op.execute(
        "INSERT INTO system_settings (key, value, updated_at) "
        "VALUES ('global_alert_percentage', '20', NOW()) "
        "ON CONFLICT (key) DO UPDATE SET value = '20', updated_at = NOW()"
    )


def downgrade() -> None:
    op.drop_column('document_types', 'alert_percentage_override')
    op.execute("DELETE FROM system_settings WHERE key = 'global_alert_percentage'")
