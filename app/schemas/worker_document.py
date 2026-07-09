from datetime import datetime, date
from pydantic import BaseModel, ConfigDict

from app.models.associations import DocumentStatus
from app.schemas.document_type import DocumentTypeRead


class WorkerDocumentBase(BaseModel):
    worker_id: int
    document_type_id: int
    project_id: int | None = None
    original_filename: str
    file_size_bytes: int | None = None
    mime_type: str | None = None
    issue_date: date | None = None
    expiry_date: date | None = None


class WorkerDocumentCreate(WorkerDocumentBase):
    file_path: str  # Set by the storage service after upload


class WorkerDocumentUpdate(BaseModel):
    status: DocumentStatus | None = None
    reviewer_notes: str | None = None


class WorkerDocumentRead(WorkerDocumentBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    file_path: str
    upload_date: datetime
    status: DocumentStatus
    reviewer_notes: str | None = None
    custom_alert_percentage: int | None = None
    is_archived: bool = False
    created_at: datetime
    updated_at: datetime
    document_type: DocumentTypeRead
