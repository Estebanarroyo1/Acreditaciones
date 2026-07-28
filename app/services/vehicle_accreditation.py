import json
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.vehicle import Vehicle
from app.models.vehicle_document_type import VehicleDocumentType
from app.models.vehicle_document import VehicleDocument
from app.models.vehicle_maintenance import VehicleMaintenance
from app.models.system_settings import SystemSetting
from app.models.associations import DocumentStatus
from app.schemas.vehicle_profile import (
    VehicleDocumentCheck,
    VehicleMaintenanceCheck,
    VehicleFullProfile,
    VehicleGlobalStatus,
    TrafficLight,
    DocCheckStatus,
)

_VEHICLE_ALERT_KEY = "vehicle_global_alert_days"
_DEFAULT_VEHICLE_DAYS = 30


async def _load_global_alert_days(db: AsyncSession) -> int:
    result = await db.execute(
        select(SystemSetting).where(SystemSetting.key == _VEHICLE_ALERT_KEY)
    )
    setting = result.scalar_one_or_none()
    if setting:
        try:
            return int(json.loads(setting.value))
        except Exception:
            pass
    return _DEFAULT_VEHICLE_DAYS


def _effective_alert_days(
    doc: VehicleDocument | None,
    vdt: VehicleDocumentType,
    global_days: int,
) -> int:
    if doc is not None and doc.custom_alert_days is not None:
        return doc.custom_alert_days
    if vdt.alert_days_override is not None:
        return vdt.alert_days_override
    return global_days


def _worst_traffic(*lights: TrafficLight | None) -> TrafficLight | None:
    if not lights:
        return None
    order = {"red": 0, "yellow": 1, "green": 2}
    valid = [l for l in lights if l is not None]
    if not valid:
        return None
    return min(valid, key=lambda l: order[l])


def _doc_traffic_light(checks: list[VehicleDocumentCheck]) -> TrafficLight | None:
    if not checks:
        return None
    has_yellow = False
    for c in checks:
        if c.check_status in ("expired", "missing"):
            return "red"
        if c.check_status in ("expiring_soon", "pending_review"):
            has_yellow = True
    return "yellow" if has_yellow else "green"


def _maintenance_light(
    current: float,
    next_service: float,
    last_service: float | None,
    global_days: int,
) -> TrafficLight:
    if current >= next_service:
        return "red"
    if last_service is not None:
        life_cycle = next_service - last_service
        if life_cycle > 0:
            remaining = next_service - current
            if remaining <= global_days:
                return "yellow"
    return "green"


def _evaluate_doc(
    doc: VehicleDocument,
    vdt: VehicleDocumentType,
    today: date,
    global_days: int,
) -> tuple[DocCheckStatus, int | None]:
    if doc.status == DocumentStatus.REJECTED:
        return "missing", None
    if doc.expiry_date is None:
        return "ok", None

    days_remaining = (doc.expiry_date - today).days
    if days_remaining < 0:
        return "expired", days_remaining

    threshold = _effective_alert_days(doc, vdt, global_days)
    if days_remaining <= threshold:
        return "expiring_soon", days_remaining
    return "ok", days_remaining


def _build_required_checks(
    required_types: list[VehicleDocumentType],
    latest_doc: dict[int, VehicleDocument],
    today: date,
    global_days: int,
) -> list[VehicleDocumentCheck]:
    """All required types appear — missing if no doc uploaded."""
    checks: list[VehicleDocumentCheck] = []
    for vdt in required_types:
        doc = latest_doc.get(vdt.id)
        if doc is None:
            checks.append(VehicleDocumentCheck(
                vehicle_document_type_id=vdt.id,
                vehicle_document_type_name=vdt.name,
                check_status="missing",
            ))
            continue
        check_status, days_until = _evaluate_doc(doc, vdt, today, global_days)
        checks.append(VehicleDocumentCheck(
            vehicle_document_type_id=vdt.id,
            vehicle_document_type_name=vdt.name,
            check_status=check_status,
            vehicle_document_id=doc.id,
            expiry_date=doc.expiry_date.isoformat() if doc.expiry_date else None,
            days_until_expiry=days_until,
            custom_alert_days=doc.custom_alert_days,
        ))
    return checks


def _build_additional_checks(
    all_types_by_id: dict[int, VehicleDocumentType],
    latest_doc: dict[int, VehicleDocument],
    today: date,
    global_days: int,
) -> list[VehicleDocumentCheck]:
    """Only uploaded docs where type.is_required_base=False."""
    checks: list[VehicleDocumentCheck] = []
    for type_id, doc in latest_doc.items():
        vdt = all_types_by_id.get(type_id)
        if vdt is None or vdt.is_required_base:
            continue
        check_status, days_until = _evaluate_doc(doc, vdt, today, global_days)
        checks.append(VehicleDocumentCheck(
            vehicle_document_type_id=vdt.id,
            vehicle_document_type_name=vdt.name,
            check_status=check_status,
            vehicle_document_id=doc.id,
            expiry_date=doc.expiry_date.isoformat() if doc.expiry_date else None,
            days_until_expiry=days_until,
            custom_alert_days=doc.custom_alert_days,
        ))
    return checks


async def get_vehicle_full_profile(vehicle_id: int, db: AsyncSession) -> VehicleFullProfile | None:
    result = await db.execute(
        select(Vehicle)
        .options(
            selectinload(Vehicle.documents).selectinload(VehicleDocument.vehicle_document_type),
            selectinload(Vehicle.maintenance_records),
        )
        .where(Vehicle.id == vehicle_id)
    )
    vehicle = result.scalar_one_or_none()
    if vehicle is None:
        return None

    global_days = await _load_global_alert_days(db)
    today = date.today()

    vdt_result = await db.execute(
        select(VehicleDocumentType).where(VehicleDocumentType.is_active == True)
    )
    all_doc_types = vdt_result.scalars().all()
    all_types_by_id = {vdt.id: vdt for vdt in all_doc_types}
    required_types = [vdt for vdt in all_doc_types if vdt.is_required_base]

    latest_doc: dict[int, VehicleDocument] = {}
    for doc in vehicle.documents:
        existing = latest_doc.get(doc.vehicle_document_type_id)
        if existing is None or doc.upload_date > existing.upload_date:
            latest_doc[doc.vehicle_document_type_id] = doc

    required_doc_checks = _build_required_checks(required_types, latest_doc, today, global_days)
    additional_doc_checks = _build_additional_checks(all_types_by_id, latest_doc, today, global_days)

    maint_checks: list[VehicleMaintenanceCheck] = []
    for maint in vehicle.maintenance_records:
        if not maint.is_active:
            continue
        m_light = _maintenance_light(
            maint.current_meter, maint.next_service_meter,
            maint.last_service_meter, global_days,
        )
        maint_checks.append(VehicleMaintenanceCheck(
            vehicle_maintenance_id=maint.id,
            maintenance_program=maint.maintenance_program,
            measurement_unit=maint.measurement_unit,
            maintenance_status=m_light,
            usage_remaining=maint.next_service_meter - maint.current_meter,
            next_service_meter=maint.next_service_meter,
            current_meter=maint.current_meter,
            last_service_meter=maint.last_service_meter,
        ))

    required_doc_light = _doc_traffic_light(required_doc_checks)
    additional_doc_light = _doc_traffic_light(additional_doc_checks) if additional_doc_checks else None
    doc_light = _worst_traffic(required_doc_light, additional_doc_light)
    maint_lights = [c.maintenance_status for c in maint_checks] or [None]
    maint_light = _worst_traffic(*maint_lights)
    global_light = _worst_traffic(doc_light, maint_light)

    return VehicleFullProfile(
        vehicle_id=vehicle.id,
        type=vehicle.type,
        brand=vehicle.brand,
        model=vehicle.model,
        year=vehicle.year,
        engine_number=vehicle.engine_number,
        vin_chassis=vehicle.vin_chassis,
        owners=vehicle.owners,
        municipality=vehicle.municipality,
        license_plate=vehicle.license_plate,
        insurance_company=vehicle.insurance_company,
        insurance_policy_number=vehicle.insurance_policy_number,
        tag_id=vehicle.tag_id,
        gps_id=vehicle.gps_id,
        is_active=vehicle.is_active,
        required_doc_traffic_light=required_doc_light,
        additional_doc_traffic_light=additional_doc_light,
        doc_traffic_light=doc_light,
        maintenance_traffic_light=maint_light,
        global_traffic_light=global_light,
        required_document_checks=required_doc_checks,
        additional_document_checks=additional_doc_checks,
        maintenance_checks=maint_checks,
    )


async def get_vehicles_global_status(
    db: AsyncSession,
    active_only: bool = True,
    limit: int | None = None,
    offset: int | None = None,
) -> list[VehicleGlobalStatus]:
    q = select(Vehicle)
    if active_only:
        q = q.where(Vehicle.is_active == True)
    q = q.order_by(Vehicle.license_plate, Vehicle.id)  # orden estable
    if limit is not None:
        q = q.limit(limit).offset(offset or 0)
    result = await db.execute(q)
    vehicles = result.scalars().all()

    global_days = await _load_global_alert_days(db)
    today = date.today()

    vdt_result = await db.execute(
        select(VehicleDocumentType).where(VehicleDocumentType.is_active == True)
    )
    all_doc_types = vdt_result.scalars().all()
    all_types_by_id = {vdt.id: vdt for vdt in all_doc_types}
    required_types = [vdt for vdt in all_doc_types if vdt.is_required_base]

    if not vehicles:
        return []

    # ── Batch (evita N+1): un solo query de documentos y uno de mantenciones para
    # TODA la página de vehículos, en vez de dos queries por vehículo. ────────────
    vehicle_ids = [v.id for v in vehicles]

    docs_result = await db.execute(
        select(VehicleDocument)
        .where(VehicleDocument.vehicle_id.in_(vehicle_ids))
        .options(selectinload(VehicleDocument.vehicle_document_type))
        .order_by(VehicleDocument.upload_date.desc())
    )
    docs_by_vehicle: dict[int, list[VehicleDocument]] = {}
    for doc in docs_result.scalars().all():
        docs_by_vehicle.setdefault(doc.vehicle_id, []).append(doc)

    maints_result = await db.execute(
        select(VehicleMaintenance).where(
            VehicleMaintenance.vehicle_id.in_(vehicle_ids),
            VehicleMaintenance.is_active == True,
        )
    )
    maints_by_vehicle: dict[int, list[VehicleMaintenance]] = {}
    for m in maints_result.scalars().all():
        maints_by_vehicle.setdefault(m.vehicle_id, []).append(m)

    statuses: list[VehicleGlobalStatus] = []
    for vehicle in vehicles:
        all_docs = docs_by_vehicle.get(vehicle.id, [])

        latest_doc: dict[int, VehicleDocument] = {}
        for doc in all_docs:
            existing = latest_doc.get(doc.vehicle_document_type_id)
            if existing is None or doc.upload_date > existing.upload_date:
                latest_doc[doc.vehicle_document_type_id] = doc

        required_checks = _build_required_checks(required_types, latest_doc, today, global_days)
        additional_checks = _build_additional_checks(all_types_by_id, latest_doc, today, global_days)

        maints = maints_by_vehicle.get(vehicle.id, [])
        maint_lights = [
            _maintenance_light(m.current_meter, m.next_service_meter, m.last_service_meter, global_days)
            for m in maints
        ]

        required_light = _doc_traffic_light(required_checks)
        additional_light = _doc_traffic_light(additional_checks) if additional_checks else None
        doc_light = _worst_traffic(required_light, additional_light)
        maint_light = _worst_traffic(*maint_lights) if maint_lights else None
        global_light = _worst_traffic(doc_light, maint_light)

        statuses.append(VehicleGlobalStatus(
            vehicle_id=vehicle.id,
            license_plate=vehicle.license_plate,
            type=vehicle.type,
            brand=vehicle.brand,
            model=vehicle.model,
            year=vehicle.year,
            is_active=vehicle.is_active,
            global_traffic_light=global_light,
        ))

    return statuses
