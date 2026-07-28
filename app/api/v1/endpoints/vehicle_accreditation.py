from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.pagination import Pagination, pagination_params, set_total_count
from app.core.permissions import Module, PermissionLevel, require_module
from app.db.session import get_db
from app.models.vehicle import Vehicle
from app.schemas.vehicle_profile import VehicleFullProfile, VehicleGlobalStatus
from app.services.vehicle_accreditation import (
    get_vehicle_full_profile,
    get_vehicles_global_status,
)

router = APIRouter(
    prefix="/vehicle-accreditation",
    tags=["vehicle-accreditation"],
    dependencies=[Depends(require_module(Module.vehiculos, PermissionLevel.read))],
)


@router.get("/global-status", response_model=list[VehicleGlobalStatus])
async def vehicles_global_status(
    response: Response,
    active_only: bool = True,
    pagination: Pagination = Depends(pagination_params),
    db: AsyncSession = Depends(get_db),
):
    count_q = select(func.count()).select_from(Vehicle)
    if active_only:
        count_q = count_q.where(Vehicle.is_active == True)
    total = await db.scalar(count_q)

    items = await get_vehicles_global_status(
        db,
        active_only=active_only,
        limit=pagination.limit,
        offset=pagination.offset,
    )
    set_total_count(response, total or 0)
    return items


@router.get("/{vehicle_id}", response_model=VehicleFullProfile)
async def vehicle_full_profile(vehicle_id: int, db: AsyncSession = Depends(get_db)):
    profile = await get_vehicle_full_profile(vehicle_id, db)
    if profile is None:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado.")
    return profile
