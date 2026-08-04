from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.associations import DocumentStatus
from app.schemas.vehicle_document_type import VehicleDocumentTypeRead


class VehicleDocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    vehicle_id: int
    vehicle_document_type_id: int
    vehicle_document_type: VehicleDocumentTypeRead
    file_path: str
    original_filename: str
    file_size_bytes: Optional[int] = None
    mime_type: Optional[str] = None
    upload_date: datetime
    issue_date: Optional[date] = None
    expiry_date: Optional[date] = None
    status: DocumentStatus
    reviewer_notes: Optional[str] = None
    custom_alert_days: Optional[int] = None
    created_at: datetime
    updated_at: datetime


class VehicleDocumentReview(BaseModel):
    status: DocumentStatus
    reviewer_notes: Optional[str] = None
