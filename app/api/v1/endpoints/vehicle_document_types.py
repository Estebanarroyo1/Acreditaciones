from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Module, PermissionLevel, require_module
from app.db.session import get_db
from app.models.vehicle_document_type import VehicleDocumentType
from app.schemas.vehicle_document_type import (
    VehicleDocumentTypeCreate,
    VehicleDocumentTypeRead,
    VehicleDocumentTypeUpdate,
)

router = APIRouter(prefix="/vehicle-document-types", tags=["vehicle-document-types"])

_R = [Depends(require_module(Module.vehiculos, PermissionLevel.read))]
_W = [Depends(require_module(Module.vehiculos, PermissionLevel.write))]


@router.get("/", response_model=list[VehicleDocumentTypeRead], dependencies=_R)
async def list_vehicle_document_types(
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
):
    q = select(VehicleDocumentType)
    if active_only:
        q = q.where(VehicleDocumentType.is_active == True)
    result = await db.execute(q.order_by(VehicleDocumentType.name))
    return result.scalars().all()


@router.post(
    "/",
    response_model=VehicleDocumentTypeRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=_W,
)
async def create_vehicle_document_type(
    payload: VehicleDocumentTypeCreate, db: AsyncSession = Depends(get_db)
):
    vdt = VehicleDocumentType(**payload.model_dump())
    db.add(vdt)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un tipo de documento con ese nombre.",
        )
    await db.refresh(vdt)
    return vdt


@router.patch("/{vdt_id}", response_model=VehicleDocumentTypeRead, dependencies=_W)
async def update_vehicle_document_type(
    vdt_id: int, payload: VehicleDocumentTypeUpdate, db: AsyncSession = Depends(get_db)
):
    vdt = await db.get(VehicleDocumentType, vdt_id)
    if not vdt:
        raise HTTPException(status_code=404, detail="Tipo de documento no encontrado.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(vdt, field, value)
    await db.commit()
    await db.refresh(vdt)
    return vdt


@router.delete("/{vdt_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=_W)
async def delete_vehicle_document_type(vdt_id: int, db: AsyncSession = Depends(get_db)):
    vdt = await db.get(VehicleDocumentType, vdt_id)
    if not vdt:
        raise HTTPException(status_code=404, detail="Tipo de documento no encontrado.")
    try:
        await db.delete(vdt)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        # Soft-delete instead if documents reference it
        vdt2 = await db.get(VehicleDocumentType, vdt_id)
        if vdt2:
            vdt2.is_active = False
            await db.commit()
