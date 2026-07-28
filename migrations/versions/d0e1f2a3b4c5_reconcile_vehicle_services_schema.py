"""reconcile vehicle_services schema drift (idempotent)

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-07-28

Migración de RECONCILIACIÓN, no de feature nueva.

Contexto: en algunas Bases (p. ej. entornos de desarrollo) los objetos que creó
`4d6f6fd009f1_add_vehicle_services_and_is_global_requirement` fueron eliminados
posteriormente (cirugía manual / downgrade parcial) mientras `alembic_version`
siguió marcando esa revisión como aplicada. Resultado: el modelo `Vehicle`
referencia `vehicle_service_id` y las tablas `vehicle_services` /
`vehicle_service_document_types`, pero no existen en la BD → 500 en todo el
módulo de flota (`no existe la columna vehicles.vehicle_service_id`).

Esta migración es IDEMPOTENTE: inspecciona el esquema y crea SOLO lo que falta.
En una BD correctamente migrada (prod / fresca) es un no-op, porque esos objetos
ya existen. El downgrade es intencionalmente no-op: no debemos borrar objetos que
legítimamente pertenecen a `4d6f6fd009f1` en BDs sanas.
"""
from alembic import op
import sqlalchemy as sa

revision = 'd0e1f2a3b4c5'
down_revision = 'c9d0e1f2a3b4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()

    def _tables() -> set[str]:
        return set(sa.inspect(bind).get_table_names())

    def _columns(table: str) -> set[str]:
        return {c["name"] for c in sa.inspect(bind).get_columns(table)}

    # 1) Tabla vehicle_services
    if "vehicle_services" not in _tables():
        op.create_table(
            "vehicle_services",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("name", sa.String(length=200), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("name"),
        )
        op.create_index(op.f("ix_vehicle_services_id"), "vehicle_services", ["id"], unique=False)

    # 2) Tabla puente vehicle_service_document_types
    if "vehicle_service_document_types" not in _tables():
        op.create_table(
            "vehicle_service_document_types",
            sa.Column("vehicle_service_id", sa.Integer(), nullable=False),
            sa.Column("vehicle_document_type_id", sa.Integer(), nullable=False),
            sa.ForeignKeyConstraint(
                ["vehicle_document_type_id"], ["vehicle_document_types.id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(
                ["vehicle_service_id"], ["vehicle_services.id"], ondelete="CASCADE"
            ),
            sa.PrimaryKeyConstraint("vehicle_service_id", "vehicle_document_type_id"),
        )

    # 3) Columna vehicles.vehicle_service_id + FK (guardar por la columna cubre la FK)
    if "vehicle_service_id" not in _columns("vehicles"):
        op.add_column("vehicles", sa.Column("vehicle_service_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            "fk_vehicles_vehicle_service_id",
            "vehicles", "vehicle_services",
            ["vehicle_service_id"], ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    # No-op deliberado: es una reconciliación, no una feature. Borrar estos objetos
    # rompería BDs que los tienen correctamente desde 4d6f6fd009f1.
    pass
