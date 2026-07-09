from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class Project(Base, TimestampMixin):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)

    # Relationships
    worker_assignments: Mapped[list["WorkerProject"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    required_document_types: Mapped[list["ProjectDocumentType"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
