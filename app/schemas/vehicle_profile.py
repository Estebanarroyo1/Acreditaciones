from typing import Literal, Optional

from pydantic import BaseModel

from app.models.vehicle_maintenance import MeasurementUnit

# TrafficLight canónico compartido con el módulo de trabajadores (Enum str).
# Antes acá era un Literal con los mismos valores; se unificó para tener un solo
# tipo. Al ser un Enum que hereda de str con idénticos valores, la serialización
# JSON es byte-idéntica ("green"/"yellow"/"red"). Ver app/services/traffic.py.
from app.schemas.accreditation import TrafficLight  # noqa: F401  (re-exportado)

DocCheckStatus = Literal["ok", "expiring_soon", "expired", "missing", "pending_review"]


class VehicleDocumentCheck(BaseModel):
    vehicle_document_type_id: int
    vehicle_document_type_name: str
    check_status: DocCheckStatus
    vehicle_document_id: Optional[int] = None
    expiry_date: Optional[str] = None
    days_until_expiry: Optional[int] = None
    custom_alert_days: Optional[int] = None


class VehicleMaintenanceCheck(BaseModel):
    vehicle_maintenance_id: int
    maintenance_program: str
    measurement_unit: MeasurementUnit
    maintenance_status: TrafficLight
    usage_remaining: Optional[float] = None
    next_service_meter: float
    current_meter: float
    last_service_meter: Optional[float] = None


class VehicleFullProfile(BaseModel):
    vehicle_id: int
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
    is_active: bool
    required_doc_traffic_light: Optional[TrafficLight] = None
    additional_doc_traffic_light: Optional[TrafficLight] = None
    doc_traffic_light: Optional[TrafficLight] = None
    maintenance_traffic_light: Optional[TrafficLight] = None
    global_traffic_light: Optional[TrafficLight] = None
    required_document_checks: list[VehicleDocumentCheck]
    additional_document_checks: list[VehicleDocumentCheck]
    maintenance_checks: list[VehicleMaintenanceCheck]


class VehicleGlobalStatus(BaseModel):
    vehicle_id: int
    license_plate: str
    type: str
    brand: str
    model: str
    year: Optional[int] = None
    is_active: bool
    global_traffic_light: Optional[TrafficLight] = None
