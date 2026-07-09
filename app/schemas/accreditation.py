from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict

from app.models.worker import WorkLocation


class TrafficLight(str, Enum):
    GREEN = "green"
    YELLOW = "yellow"
    RED = "red"


class DocumentCheckStatus(str, Enum):
    OK = "ok"
    EXPIRING_SOON = "expiring_soon"
    EXPIRED = "expired"
    MISSING = "missing"
    PENDING_REVIEW = "pending_review"


class DocumentCheck(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    document_type_id: int
    document_type_name: str
    category: str
    is_mandatory: bool
    is_global: bool = False
    check_status: DocumentCheckStatus
    worker_document_id: int | None = None
    expiry_date: date | None = None
    days_until_expiry: int | None = None


class AccreditationResponse(BaseModel):
    """Semáforo por proyecto."""

    worker_id: int
    project_id: int
    traffic_light: TrafficLight
    summary: str
    documents: list[DocumentCheck]
    evaluated_at: datetime


# ── Global status (across all projects) ──────────────────────────────────────

class ProjectTrafficLight(BaseModel):
    """Estado de acreditación de un trabajador en un proyecto concreto."""

    project_id: int
    project_name: str
    traffic_light: TrafficLight


class WorkerGlobalStatus(BaseModel):
    """
    Semáforo global de un trabajador: el peor estado de todos sus proyectos.
    global_traffic_light = None significa que no tiene proyectos asignados.
    global_status: peor estado de los requisitos base globales (siempre calculado).
    project_status: peor estado de los requisitos específicos de proyecto; None si sin proyectos.
    """

    worker_id: int
    first_name: str
    last_name: str
    dni: str
    email: str | None
    phone: str | None
    work_location: WorkLocation
    is_active: bool
    assigned_projects: int
    global_traffic_light: TrafficLight | None
    project_statuses: list[ProjectTrafficLight]
    global_status: TrafficLight
    achs_status: TrafficLight | None
    project_status: TrafficLight | None
