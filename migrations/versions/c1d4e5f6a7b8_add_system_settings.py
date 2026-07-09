"""add system_settings table

Revision ID: c1d4e5f6a7b8
Revises: 38ed3b863ecb
Create Date: 2026-06-12 11:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'c1d4e5f6a7b8'
down_revision = '38ed3b863ecb'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'system_settings',
        sa.Column('key', sa.String(64), primary_key=True),
        sa.Column('value', sa.Text(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
    )
    op.execute(
        "INSERT INTO system_settings (key, value, updated_at) "
        "VALUES ('alert_threshold_days', '[60, 30, 15, 7, 0]', NOW())"
    )


def downgrade() -> None:
    op.drop_table('system_settings')
