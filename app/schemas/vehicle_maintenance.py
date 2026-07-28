from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.vehicle_maintenance import MeasurementUnit


class VehicleMaintenanceBase(BaseModel):
    maintenance_program: str
    measurement_unit: MeasurementUnit
    last_service_date: Optional[date] = None
    last_service_meter: Optional[float] = None
    next_service_meter: float
    current_meter: float = 0.0


class VehicleMaintenanceCreate(VehicleMaintenanceBase):
    vehicle_id: int


class VehicleMaintenanceUpdate(BaseModel):
    maintenance_program: Optional[str] = None
    measurement_unit: Optional[MeasurementUnit] = None
    last_service_date: Optional[date] = None
    last_service_meter: Optional[float] = None
    next_service_meter: Optional[float] = None
    current_meter: Optional[float] = None
    is_active: Optional[bool] = None


class VehicleMaintenanceRead(VehicleMaintenanceBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    vehicle_id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
