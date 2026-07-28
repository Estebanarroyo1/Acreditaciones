from sqlalchemy import Boolean, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class VehicleDocumentType(Base, TimestampMixin):
    __tablename__ = "vehicle_document_types"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    validity_days: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    alert_days_override: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_required_base: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    vehicle_documents: Mapped[list["VehicleDocument"]] = relationship(
        back_populates="vehicle_document_type"
    )
