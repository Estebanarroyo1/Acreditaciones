from __future__ import annotations
from typing import TYPE_CHECKING

from sqlalchemy import String, Text, Integer, Boolean, Index, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.vehicle_service import VehicleService


class Vehicle(Base, TimestampMixin):
    __tablename__ = "vehicles"
    __table_args__ = (
        Index("ix_vehicles_license_plate", "license_plate", unique=True),
        # Cubre el filtro active_only de listados y semáforo global de flota.
        Index("ix_vehicles_is_active", "is_active"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    type: Mapped[str] = mapped_column(String(100), nullable=False)
    brand: Mapped[str] = mapped_column(String(100), nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    year: Mapped[int | None] = mapped_column(Integer)
    engine_number: Mapped[str | None] = mapped_column(String(100))
    vin_chassis: Mapped[str | None] = mapped_column(String(100))
    owners: Mapped[str | None] = mapped_column(Text)
    municipality: Mapped[str | None] = mapped_column(String(150))
    license_plate: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    insurance_company: Mapped[str | None] = mapped_column(String(150))
    insurance_policy_number: Mapped[str | None] = mapped_column(String(100))
    tag_id: Mapped[str | None] = mapped_column(String(100))
    gps_id: Mapped[str | None] = mapped_column(String(100))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    vehicle_service_id: Mapped[int | None] = mapped_column(
        ForeignKey("vehicle_services.id", ondelete="SET NULL"), nullable=True
    )

    documents: Mapped[list["VehicleDocument"]] = relationship(
        back_populates="vehicle", cascade="all, delete-orphan"
    )
    maintenance_records: Mapped[list["VehicleMaintenance"]] = relationship(
        back_populates="vehicle", cascade="all, delete-orphan"
    )
    service: Mapped["VehicleService | None"] = relationship(
        "VehicleService", back_populates="vehicles"
    )
