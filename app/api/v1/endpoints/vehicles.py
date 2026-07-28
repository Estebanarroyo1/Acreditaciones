from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Module, PermissionLevel, require_module
from app.db.session import get_db
from app.models.vehicle import Vehicle
from app.models.vehicle_document import VehicleDocument
from app.schemas.vehicle import VehicleCreate, VehicleUpdate, VehicleRead
from app.services.storage import delete_file
from app.api.pagination import Pagination, pagination_params, set_total_count

router = APIRouter(prefix="/vehicles", tags=["vehicles"])

_R = [Depends(require_module(Module.vehiculos, PermissionLevel.read))]
_W = [Depends(require_module(Module.vehiculos, PermissionLevel.write))]


@router.get("/", response_model=list[VehicleRead], dependencies=_R)
async def list_vehicles(
    response: Response,
    active_only: bool = True,
    pagination: Pagination = Depends(pagination_params),
    db: AsyncSession = Depends(get_db),
):
    base = select(Vehicle)
    count_q = select(func.count()).select_from(Vehicle)
    if active_only:
        base = base.where(Vehicle.is_active == True)
        count_q = count_q.where(Vehicle.is_active == True)
    total = await db.scalar(count_q)
    result = await db.execute(
        base.order_by(Vehicle.license_plate, Vehicle.id)
        .limit(pagination.limit)
        .offset(pagination.offset)
    )
    set_total_count(response, total or 0)
    return result.scalars().all()


@router.post("/", response_model=VehicleRead, status_code=status.HTTP_201_CREATED, dependencies=_W)
async def create_vehicle(payload: VehicleCreate, db: AsyncSession = Depends(get_db)):
    vehicle = Vehicle(**payload.model_dump())
    db.add(vehicle)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un vehículo con esa patente.",
        )
    await db.refresh(vehicle)
    return vehicle


@router.get("/{vehicle_id}", response_model=VehicleRead, dependencies=_R)
async def get_vehicle(vehicle_id: int, db: AsyncSession = Depends(get_db)):
    vehicle = await db.get(Vehicle, vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado.")
    return vehicle


@router.patch("/{vehicle_id}", response_model=VehicleRead, dependencies=_W)
async def update_vehicle(
    vehicle_id: int, payload: VehicleUpdate, db: AsyncSession = Depends(get_db)
):
    vehicle = await db.get(Vehicle, vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(vehicle, field, value)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un vehículo con esa patente.",
        )
    await db.refresh(vehicle)
    return vehicle


@router.patch("/{vehicle_id}/archive", response_model=VehicleRead, dependencies=_W)
async def archive_vehicle(vehicle_id: int, db: AsyncSession = Depends(get_db)):
    vehicle = await db.get(Vehicle, vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado.")
    vehicle.is_active = False
    await db.commit()
    await db.refresh(vehicle)
    return vehicle


@router.patch("/{vehicle_id}/restore", response_model=VehicleRead, dependencies=_W)
async def restore_vehicle(vehicle_id: int, db: AsyncSession = Depends(get_db)):
    vehicle = await db.get(Vehicle, vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado.")
    vehicle.is_active = True
    await db.commit()
    await db.refresh(vehicle)
    return vehicle


@router.delete("/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=_W)
async def delete_vehicle(vehicle_id: int, db: AsyncSession = Depends(get_db)):
    vehicle = await db.get(Vehicle, vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado.")
    # Recolectar rutas de los documentos ANTES del delete (la cascada de BD los
    # borra pero deja los archivos físicos huérfanos).
    paths_result = await db.execute(
        select(VehicleDocument.file_path).where(VehicleDocument.vehicle_id == vehicle_id)
    )
    file_paths = [p for p in paths_result.scalars().all() if p]
    await db.delete(vehicle)
    await db.commit()
    # Best effort: la operación de BD ya se completó; limpiar archivos físicos.
    for path in file_paths:
        delete_file(path)
