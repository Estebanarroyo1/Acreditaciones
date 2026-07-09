import enum

from sqlalchemy import String, Date, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class WorkLocation(str, enum.Enum):
    PLANTA = "Planta"
    OBRA = "Obra"


class Worker(Base, TimestampMixin):
    __tablename__ = "workers"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    dni: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(30))
    birth_date: Mapped[str | None] = mapped_column(Date)
    work_location: Mapped[WorkLocation] = mapped_column(
        Enum(WorkLocation), default=WorkLocation.OBRA, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)

    # Relationships
    project_assignments: Mapped[list["WorkerProject"]] = relationship(
        back_populates="worker", cascade="all, delete-orphan"
    )
    documents: Mapped[list["WorkerDocument"]] = relationship(
        back_populates="worker", cascade="all, delete-orphan"
    )
