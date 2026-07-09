from datetime import datetime
from pydantic import BaseModel, ConfigDict

from app.schemas.document_type import DocumentTypeRead


class WorkerProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    worker_id: int
    project_id: int
    assigned_at: datetime
    is_active: bool


class ProjectRequirementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    document_type_id: int
    is_mandatory: bool
    document_type: DocumentTypeRead
