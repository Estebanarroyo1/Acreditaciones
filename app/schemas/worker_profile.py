from datetime import date

from pydantic import BaseModel

from app.schemas.accreditation import DocumentCheckStatus, TrafficLight


class GlobalRequirementCheck(BaseModel):
    document_type_id: int
    document_type_name: str
    category: str
    validity_days: int | None
    check_status: DocumentCheckStatus
    worker_document_id: int | None = None
    expiry_date: date | None = None
    days_until_expiry: int | None = None
    custom_alert_percentage: int | None = None
    is_achs: bool = False
    achs_category: str | None = None


class ProjectSpecificCheck(BaseModel):
    document_type_id: int
    document_type_name: str
    category: str
    is_mandatory: bool
    check_status: DocumentCheckStatus
    worker_document_id: int | None = None
    expiry_date: date | None = None
    days_until_expiry: int | None = None
    custom_alert_percentage: int | None = None


class AssignedProjectProfile(BaseModel):
    project_id: int
    project_name: str
    project_description: str | None
    traffic_light: TrafficLight
    project_specific_requirements: list[ProjectSpecificCheck]


class ArchivedProjectDoc(BaseModel):
    document_type_id: int
    document_type_name: str
    category: str
    worker_document_id: int | None = None
    expiry_date: date | None = None


class ArchivedProjectProfile(BaseModel):
    project_id: int
    project_name: str
    project_description: str | None
    documents: list[ArchivedProjectDoc]


class WorkerFullProfile(BaseModel):
    worker_id: int
    first_name: str
    last_name: str
    dni: str
    email: str | None
    phone: str | None
    is_active: bool
    global_traffic_light: TrafficLight | None
    global_requirements: list[GlobalRequirementCheck]
    assigned_projects: list[AssignedProjectProfile]
    archived_projects: list[ArchivedProjectProfile] = []
