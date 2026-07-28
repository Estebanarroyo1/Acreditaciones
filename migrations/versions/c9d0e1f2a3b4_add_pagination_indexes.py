"""add indexes for pagination/order-filter columns

Revision ID: c9d0e1f2a3b4
Revises: b7c8d9e0f1a2
Create Date: 2026-07-28

Índices que respaldan el orden/filtro de los listados paginados y de los
semáforos globales:
  - workers(is_active, last_name, first_name): filtro + orden del directorio.
  - vehicles(is_active): filtro active_only de flota.
  - worker_documents(worker_id, upload_date): "último doc por (worker, tipo)".
  - vehicle_documents(vehicle_id, upload_date): batch de docs del semáforo flota.
"""
from alembic import op

revision = 'c9d0e1f2a3b4'
down_revision = 'b7c8d9e0f1a2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        'ix_workers_active_name', 'workers',
        ['is_active', 'last_name', 'first_name'],
    )
    op.create_index('ix_vehicles_is_active', 'vehicles', ['is_active'])
    op.create_index(
        'ix_worker_documents_worker_upload', 'worker_documents',
        ['worker_id', 'upload_date'],
    )
    op.create_index(
        'ix_vehicle_documents_vehicle_upload', 'vehicle_documents',
        ['vehicle_id', 'upload_date'],
    )


def downgrade() -> None:
    op.drop_index('ix_vehicle_documents_vehicle_upload', table_name='vehicle_documents')
    op.drop_index('ix_worker_documents_worker_upload', table_name='worker_documents')
    op.drop_index('ix_vehicles_is_active', table_name='vehicles')
    op.drop_index('ix_workers_active_name', table_name='workers')
