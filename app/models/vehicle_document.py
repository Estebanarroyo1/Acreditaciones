from datetime import datetime, date

from sqlalchemy import ForeignKey, DateTime, Date, String, Text, Integer, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin
from app.models.associations import DocumentStatus

# Use native_enum=False to store values as VARCHAR (avoids PG enum case mismatch)
_STATUS_TYPE = Enum(DocumentStatus, native_enum=False)


class VehicleDocument(Base, TimestampMixin):
    __tablename__ = "vehicle_documents"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    vehicle_id: Mapped[int] = mapped_column(
        ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    vehicle_document_type_id: Mapped[int] = mapped_column(
        ForeignKey("vehicle_document_types.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_size_bytes: Mapped[int | None] = mapped_column(Integer)
    mime_type: Mapped[str | None] = mapped_column(String(100))

    upload_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(),
        nullable=False,
    )
    issue_date: Mapped[date | None] = mapped_column(Date)
    expiry_date: Mapped[date | None] = mapped_column(Date, index=True)

    status: Mapped[DocumentStatus] = mapped_column(
        _STATUS_TYPE,
        default=DocumentStatus.UPLOADED,
        nullable=False,
        index=True,
    )
    reviewer_notes: Mapped[str | None] = mapped_column(Text)
    custom_alert_days: Mapped[int | None] = mapped_column(Integer, nullable=True)

    vehicle: Mapped["Vehicle"] = relationship(back_populates="documents")
    vehicle_document_type: Mapped["VehicleDocumentType"] = relationship(
        back_populates="vehicle_documents", lazy="selectin"
    )
