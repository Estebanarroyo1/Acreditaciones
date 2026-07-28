import enum
from datetime import date

from sqlalchemy import Date, Enum, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class MeasurementUnit(str, enum.Enum):
    KM = "km"
    HORAS = "horas"


class VehicleMaintenance(Base, TimestampMixin):
    __tablename__ = "vehicle_maintenances"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    vehicle_id: Mapped[int] = mapped_column(
        ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False, index=True
    )

    maintenance_program: Mapped[str] = mapped_column(String(200), nullable=False)
    measurement_unit: Mapped[MeasurementUnit] = mapped_column(Enum(MeasurementUnit), nullable=False)
    last_service_date: Mapped[date | None] = mapped_column(Date)
    last_service_meter: Mapped[float | None] = mapped_column(Float)
    next_service_meter: Mapped[float] = mapped_column(Float, nullable=False)
    current_meter: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)

    vehicle: Mapped["Vehicle"] = relationship(back_populates="maintenance_records")
