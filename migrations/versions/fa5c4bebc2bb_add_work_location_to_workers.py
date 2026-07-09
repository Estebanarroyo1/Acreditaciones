"""add work_location to workers

Revision ID: fa5c4bebc2bb
Revises: d2e3f4a5b6c7
Create Date: 2026-06-19 11:18:02.016605

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'fa5c4bebc2bb'
down_revision: Union[str, None] = 'd2e3f4a5b6c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    work_location_enum = sa.Enum('PLANTA', 'OBRA', name='worklocation')
    work_location_enum.create(op.get_bind(), checkfirst=True)
    op.add_column('workers', sa.Column(
        'work_location', work_location_enum,
        nullable=False, server_default='OBRA',
    ))
    op.alter_column('workers', 'work_location', server_default=None)


def downgrade() -> None:
    op.drop_column('workers', 'work_location')
    sa.Enum(name='worklocation').drop(op.get_bind(), checkfirst=True)
