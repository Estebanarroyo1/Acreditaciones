from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

from app.schemas.vehicle_document_type import VehicleDocumentTypeRead


class VehicleServiceBase(BaseModel):
    name: str
    description: Optional[str] = None
    is_active: bool = True


class VehicleServiceCreate(VehicleServiceBase):
    document_type_ids: list[int] = []


class VehicleServiceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    document_type_ids: Optional[list[int]] = None


class VehicleServiceRead(VehicleServiceBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
    required_document_types: list[VehicleDocumentTypeRead] = []
