from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.vehicle_profile import VehicleFullProfile, VehicleGlobalStatus
from app.services.vehicle_accreditation import (
    get_vehicle_full_profile,
    get_vehicles_global_status,
)

router = APIRouter(prefix="/vehicle-accreditation", tags=["vehicle-accreditation"])


@router.get("/global-status", response_model=list[VehicleGlobalStatus])
async def vehicles_global_status(
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
):
    return await get_vehicles_global_status(db, active_only=active_only)


@router.get("/{vehicle_id}", response_model=VehicleFullProfile)
async def vehicle_full_profile(vehicle_id: int, db: AsyncSession = Depends(get_db)):
    profile = await get_vehicle_full_profile(vehicle_id, db)
    if profile is None:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado.")
    return profile
