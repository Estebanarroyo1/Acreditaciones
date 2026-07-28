"""Integration test — el semáforo global de flota NO hace N+1.

Cuenta las queries SQL emitidas por `get_vehicles_global_status` (vía el evento
`before_cursor_execute` de SQLAlchemy) y verifica que el número es constante,
independiente de la cantidad de vehículos. También cubre limit/offset.
"""
from datetime import datetime, timezone

from sqlalchemy import event

from app.models.associations import DocumentStatus
from app.models.vehicle import Vehicle
from app.models.vehicle_document import VehicleDocument
from app.models.vehicle_document_type import VehicleDocumentType
from app.models.vehicle_maintenance import MeasurementUnit, VehicleMaintenance
from app.services.vehicle_accreditation import get_vehicles_global_status


async def _seed_vehicles(db, n: int, vdt: VehicleDocumentType, prefix: str) -> None:
    for i in range(n):
        v = Vehicle(
            type="Camioneta", brand="Toyota", model="Hilux",
            license_plate=f"{prefix}{i:03d}", is_active=True,
        )
        db.add(v)
        await db.flush()
        db.add(VehicleDocument(
            vehicle_id=v.id, vehicle_document_type_id=vdt.id,
            file_path="f.pdf", original_filename="f.pdf",
            upload_date=datetime.now(timezone.utc),
            status=DocumentStatus.APPROVED,
        ))
        db.add(VehicleMaintenance(
            vehicle_id=v.id, maintenance_program="Cambio de aceite",
            measurement_unit=MeasurementUnit.KM,
            next_service_meter=10000, current_meter=5000, is_active=True,
        ))
    await db.commit()


async def _count_service_queries(db) -> tuple[list, int]:
    sync_engine = db.sync_session.get_bind()
    counter = {"n": 0}

    def _before(conn, cursor, statement, parameters, context, executemany):
        counter["n"] += 1

    event.listen(sync_engine, "before_cursor_execute", _before)
    try:
        result = await get_vehicles_global_status(db, active_only=True)
    finally:
        event.remove(sync_engine, "before_cursor_execute", _before)
    return result, counter["n"]


async def _make_vdt(db) -> VehicleDocumentType:
    vdt = VehicleDocumentType(name="Revisión Técnica", is_active=True, is_required_base=True)
    db.add(vdt)
    await db.commit()
    await db.refresh(vdt)
    return vdt


async def test_query_count_is_constant_regardless_of_vehicle_count(db_session):
    vdt = await _make_vdt(db_session)

    await _seed_vehicles(db_session, 3, vdt, prefix="AA")
    result_small, q_small = await _count_service_queries(db_session)
    assert len(result_small) == 3

    await _seed_vehicles(db_session, 5, vdt, prefix="BB")  # 8 vehículos en total
    result_large, q_large = await _count_service_queries(db_session)
    assert len(result_large) == 8

    # Sin N+1: la cantidad de queries NO crece con el número de vehículos.
    assert q_small == q_large, f"Posible N+1: {q_small} vs {q_large} queries"
    # Número reducido y constante (vehículos, alert-days, tipos, docs, selectin, mant.).
    assert q_large <= 6, f"Se esperaban <=6 queries constantes, hubo {q_large}"


async def test_limit_offset_paginates_the_service(db_session):
    vdt = await _make_vdt(db_session)
    await _seed_vehicles(db_session, 5, vdt, prefix="CC")

    page1 = await get_vehicles_global_status(db_session, active_only=True, limit=2, offset=0)
    assert len(page1) == 2

    last = await get_vehicles_global_status(db_session, active_only=True, limit=2, offset=4)
    assert len(last) == 1

    # El orden es estable por patente: la primera página empieza en CC000.
    assert page1[0].license_plate == "CC000"
