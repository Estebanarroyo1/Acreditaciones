"""
Association / junction tables for the many-to-many relationships:

  Project  <-->  DocumentType   (ProjectDocumentType)
  Worker   <-->  Project        (WorkerProject)
  Worker   <-->  DocumentType   (WorkerDocument) — stores the actual file
"""
import enum
from datetime import datetime, date
from sqlalchemy import (
    ForeignKey, DateTime, Date, String, Text, Boolean, Enum, Index, UniqueConstraint
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class WorkerProject(Base, TimestampMixin):
    """Assignment of a Worker to a Project."""

    __tablename__ = "worker_projects"
    __table_args__ = (
        UniqueConstraint("worker_id", "project_id", name="uq_worker_project"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    worker_id: Mapped[int] = mapped_column(
        ForeignKey("workers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(),
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)

    # Relationships
    worker: Mapped["Worker"] = relationship(back_populates="project_assignments")
    project: Mapped["Project"] = relationship(back_populates="worker_assignments")


class ProjectDocumentType(Base, TimestampMixin):
    """Document types required by a specific Project."""

    __tablename__ = "project_document_types"
    __table_args__ = (
        UniqueConstraint(
            "project_id", "document_type_id", name="uq_project_document_type"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    document_type_id: Mapped[int] = mapped_column(
        ForeignKey("document_types.id", ondelete="CASCADE"), nullable=False, index=True
    )
    is_mandatory: Mapped[bool] = mapped_column(default=True, nullable=False)

    # Relationships
    project: Mapped["Project"] = relationship(back_populates="required_document_types")
    document_type: Mapped["DocumentType"] = relationship(
        back_populates="project_requirements"
    )


class DocumentStatus(str, enum.Enum):
    PENDING = "PENDING"       # Aún no subido
    UPLOADED = "UPLOADED"     # Subido, pendiente de revisión
    APPROVED = "APPROVED"     # Aprobado por revisor
    REJECTED = "REJECTED"     # Rechazado (requiere resubida)
    EXPIRED = "EXPIRED"       # Venció


class WorkerDocument(Base, TimestampMixin):
    """
    Core accreditation table.
    Stores the document file a Worker uploaded for a specific DocumentType,
    in the context of a Project.
    """

    __tablename__ = "worker_documents"
    # Cubre "último documento por (worker, tipo)": filtro worker_id + orden por
    # upload_date desc del semáforo global y los lookups de acreditación.
    __table_args__ = (
        Index("ix_worker_documents_worker_upload", "worker_id", "upload_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, index=True)

    # FK references
    worker_id: Mapped[int] = mapped_column(
        ForeignKey("workers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    document_type_id: Mapped[int] = mapped_column(
        ForeignKey("document_types.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True
    )

    # File storage — path or URL returned by the storage backend (S3, local, etc.)
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_size_bytes: Mapped[int | None] = mapped_column()
    mime_type: Mapped[str | None] = mapped_column(String(100))

    # Accreditation dates
    upload_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(),
        nullable=False,
    )
    issue_date: Mapped[date | None] = mapped_column(Date)       # Fecha de emisión del doc
    expiry_date: Mapped[date | None] = mapped_column(Date, index=True)  # Fecha de vencimiento

    # Review workflow
    status: Mapped[DocumentStatus] = mapped_column(
        Enum(DocumentStatus), default=DocumentStatus.UPLOADED, nullable=False, index=True
    )
    reviewer_notes: Mapped[str | None] = mapped_column(Text)

    # Per-document alert override (level 3 of the cascade)
    custom_alert_percentage: Mapped[int | None] = mapped_column(nullable=True)

    # Soft-archive: excludes the document from active accreditation checks
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Relationships
    worker: Mapped["Worker"] = relationship(back_populates="documents")
    document_type: Mapped["DocumentType"] = relationship(
        back_populates="worker_documents"
    )
    project: Mapped["Project"] = relationship()
