from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.vehicle_maintenance import VehicleMaintenance
from app.schemas.vehicle_maintenance import (
    VehicleMaintenanceCreate,
    VehicleMaintenanceUpdate,
    VehicleMaintenanceRead,
)

router = APIRouter(prefix="/vehicle-maintenance", tags=["vehicle-maintenance"])


@router.get("/", response_model=list[VehicleMaintenanceRead])
async def list_vehicle_maintenance(
    vehicle_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(VehicleMaintenance)
        .where(VehicleMaintenance.vehicle_id == vehicle_id)
        .order_by(VehicleMaintenance.id)
    )
    return result.scalars().all()


@router.post("/", response_model=VehicleMaintenanceRead, status_code=status.HTTP_201_CREATED)
async def create_vehicle_maintenance(
    payload: VehicleMaintenanceCreate, db: AsyncSession = Depends(get_db)
):
    maint = VehicleMaintenance(**payload.model_dump())
    db.add(maint)
    await db.commit()
    await db.refresh(maint)
    return maint


@router.get("/{maint_id}", response_model=VehicleMaintenanceRead)
async def get_vehicle_maintenance(maint_id: int, db: AsyncSession = Depends(get_db)):
    maint = await db.get(VehicleMaintenance, maint_id)
    if not maint:
        raise HTTPException(status_code=404, detail="Registro de mantención no encontrado.")
    return maint


@router.patch("/{maint_id}", response_model=VehicleMaintenanceRead)
async def update_vehicle_maintenance(
    maint_id: int, payload: VehicleMaintenanceUpdate, db: AsyncSession = Depends(get_db)
):
    maint = await db.get(VehicleMaintenance, maint_id)
    if not maint:
        raise HTTPException(status_code=404, detail="Registro de mantención no encontrado.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(maint, field, value)
    await db.commit()
    await db.refresh(maint)
    return maint


@router.delete("/{maint_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vehicle_maintenance(maint_id: int, db: AsyncSession = Depends(get_db)):
    maint = await db.get(VehicleMaintenance, maint_id)
    if not maint:
        raise HTTPException(status_code=404, detail="Registro de mantención no encontrado.")
    await db.delete(maint)
    await db.commit()
