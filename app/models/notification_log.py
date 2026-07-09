from datetime import datetime, date
from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class NotificationLog(Base, TimestampMixin):
    """
    Deduplication table. One row per (document, threshold, day) ensures
    the daily job never sends the same alert twice — even if the service
    restarts mid-run.
    """

    __tablename__ = "notification_logs"
    __table_args__ = (
        UniqueConstraint(
            "worker_document_id",
            "threshold_days",
            "notification_date",
            name="uq_notification_once_per_day",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    worker_id: Mapped[int] = mapped_column(
        ForeignKey("workers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    document_type_id: Mapped[int] = mapped_column(
        ForeignKey("document_types.id", ondelete="CASCADE"), nullable=False
    )
    worker_document_id: Mapped[int] = mapped_column(
        ForeignKey("worker_documents.id", ondelete="CASCADE"), nullable=False, index=True
    )

    threshold_days: Mapped[int] = mapped_column(Integer, nullable=False)
    notification_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    recipient_email: Mapped[str] = mapped_column(String(255), nullable=False)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
