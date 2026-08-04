from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

ACHS_VALIDITY_DAYS = 365


class DocumentType(Base, TimestampMixin):
    __tablename__ = "document_types"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("document_categories.id"), nullable=True
    )
    validity_days: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    is_global_base_requirement: Mapped[bool] = mapped_column(default=False, nullable=False)
    alert_percentage_override: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # ACHS / Mutual de Seguridad fields
    is_achs: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    achs_category: Mapped[str | None] = mapped_column(String(20), nullable=True)

    @property
    def effective_validity_days(self) -> int | None:
        """Returns the canonical validity for this doc type.
        ACHS types always use ACHS_VALIDITY_DAYS regardless of any stored value."""
        if self.is_achs:
            return ACHS_VALIDITY_DAYS
        return self.validity_days

    # Relationships
    category: Mapped["DocumentCategory | None"] = relationship(
        back_populates="document_types", lazy="selectin"
    )
    project_requirements: Mapped[list["ProjectDocumentType"]] = relationship(
        back_populates="document_type"
    )
    worker_documents: Mapped[list["WorkerDocument"]] = relationship(back_populates="document_type")
