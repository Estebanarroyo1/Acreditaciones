from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Table, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.vehicle import Vehicle
    from app.models.vehicle_document_type import VehicleDocumentType

vehicle_service_document_types = Table(
    "vehicle_service_document_types",
    Base.metadata,
    Column(
        "vehicle_service_id",
        Integer,
        ForeignKey("vehicle_services.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "vehicle_document_type_id",
        Integer,
        ForeignKey("vehicle_document_types.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class VehicleService(Base, TimestampMixin):
    __tablename__ = "vehicle_services"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    required_document_types: Mapped[list["VehicleDocumentType"]] = relationship(
        "VehicleDocumentType",
        secondary=vehicle_service_document_types,
    )
    vehicles: Mapped[list["Vehicle"]] = relationship(
        "Vehicle",
        back_populates="service",
    )
