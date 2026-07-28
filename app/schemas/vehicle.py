from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class VehicleBase(BaseModel):
    type: str
    brand: str
    model: str
    year: Optional[int] = None
    engine_number: Optional[str] = None
    vin_chassis: Optional[str] = None
    owners: Optional[str] = None
    municipality: Optional[str] = None
    license_plate: str
    insurance_company: Optional[str] = None
    insurance_policy_number: Optional[str] = None
    tag_id: Optional[str] = None
    gps_id: Optional[str] = None


class VehicleCreate(VehicleBase):
    pass


class VehicleUpdate(BaseModel):
    type: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    engine_number: Optional[str] = None
    vin_chassis: Optional[str] = None
    owners: Optional[str] = None
    municipality: Optional[str] = None
    license_plate: Optional[str] = None
    insurance_company: Optional[str] = None
    insurance_policy_number: Optional[str] = None
    tag_id: Optional[str] = None
    gps_id: Optional[str] = None
    is_active: Optional[bool] = None


class VehicleRead(VehicleBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
