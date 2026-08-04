from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class VehicleDocumentTypeBase(BaseModel):
    name: str
    description: Optional[str] = None
    validity_days: Optional[int] = None
    alert_days_override: Optional[int] = None
    ai_validation_enabled: bool = True
    is_required_base: bool = True


class VehicleDocumentTypeCreate(VehicleDocumentTypeBase):
    pass


class VehicleDocumentTypeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    validity_days: Optional[int] = None
    is_active: Optional[bool] = None
    alert_days_override: Optional[int] = None
    ai_validation_enabled: Optional[bool] = None
    is_required_base: Optional[bool] = None


class VehicleDocumentTypeRead(VehicleDocumentTypeBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
