from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.pagination import Pagination, pagination_params, set_total_count
from app.core.permissions import Module, PermissionLevel, require_module
from app.db.session import get_db
from app.models.vehicle import Vehicle
from app.models.vehicle_document_type import VehicleDocumentType
from app.models.vehicle_service import VehicleService
from app.schemas.vehicle_service import (
    VehicleServiceCreate,
    VehicleServiceRead,
    VehicleServiceUpdate,
)

router = APIRouter(prefix="/vehicle-services", tags=["vehicle-services"])

_R = [Depends(require_module(Module.vehiculos, PermissionLevel.read))]
_W = [Depends(require_module(Module.vehiculos, PermissionLevel.write))]


async def _get_service_or_404(service_id: int, db: AsyncSession) -> VehicleService:
    result = await db.execute(
        select(VehicleService)
        .options(selectinload(VehicleService.required_document_types))
        .where(VehicleService.id == service_id)
    )
    svc = result.scalar_one_or_none()
    if not svc:
        raise HTTPException(status_code=404, detail="Servicio no encontrado.")
    return svc


@router.get("/", response_model=list[VehicleServiceRead], dependencies=_R)
async def list_vehicle_services(
    response: Response,
    active_only: bool = False,
    pagination: Pagination = Depends(pagination_params),
    db: AsyncSession = Depends(get_db),
):
    base = select(VehicleService).options(selectinload(VehicleService.required_document_types))
    count_q = select(func.count()).select_from(VehicleService)
    if active_only:
        base = base.where(VehicleService.is_active == True)
        count_q = count_q.where(VehicleService.is_active == True)
    total = await db.scalar(count_q)
    result = await db.execute(
        base.order_by(VehicleService.name, VehicleService.id)
        .limit(pagination.limit)
        .offset(pagination.offset)
    )
    set_total_count(response, total or 0)
    return result.scalars().all()


@router.post(
    "/", response_model=VehicleServiceRead, status_code=status.HTTP_201_CREATED, dependencies=_W
)
async def create_vehicle_service(
    payload: VehicleServiceCreate,
    db: AsyncSession = Depends(get_db),
):
    svc = VehicleService(
        name=payload.name,
        description=payload.description,
        is_active=payload.is_active,
    )
    if payload.document_type_ids:
        dt_result = await db.execute(
            select(VehicleDocumentType).where(VehicleDocumentType.id.in_(payload.document_type_ids))
        )
        svc.required_document_types = list(dt_result.scalars().all())
    db.add(svc)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un servicio con ese nombre.",
        )
    await db.refresh(svc)
    result = await db.execute(
        select(VehicleService)
        .options(selectinload(VehicleService.required_document_types))
        .where(VehicleService.id == svc.id)
    )
    return result.scalar_one()


@router.get("/{service_id}", response_model=VehicleServiceRead, dependencies=_R)
async def get_vehicle_service(service_id: int, db: AsyncSession = Depends(get_db)):
    return await _get_service_or_404(service_id, db)


@router.patch("/{service_id}", response_model=VehicleServiceRead, dependencies=_W)
async def update_vehicle_service(
    service_id: int,
    payload: VehicleServiceUpdate,
    db: AsyncSession = Depends(get_db),
):
    svc = await _get_service_or_404(service_id, db)
    data = payload.model_dump(exclude_unset=True)
    dt_ids = data.pop("document_type_ids", None)
    for field, value in data.items():
        setattr(svc, field, value)
    if dt_ids is not None:
        dt_result = await db.execute(
            select(VehicleDocumentType).where(VehicleDocumentType.id.in_(dt_ids))
        )
        svc.required_document_types = list(dt_result.scalars().all())
    await db.commit()
    result = await db.execute(
        select(VehicleService)
        .options(selectinload(VehicleService.required_document_types))
        .where(VehicleService.id == service_id)
    )
    return result.scalar_one()


@router.delete("/{service_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=_W)
async def delete_vehicle_service(service_id: int, db: AsyncSession = Depends(get_db)):
    svc = await _get_service_or_404(service_id, db)
    await db.delete(svc)
    await db.commit()


@router.post(
    "/{service_id}/document-types/{dt_id}", response_model=VehicleServiceRead, dependencies=_W
)
async def add_document_type_to_service(
    service_id: int,
    dt_id: int,
    db: AsyncSession = Depends(get_db),
):
    svc = await _get_service_or_404(service_id, db)
    vdt = await db.get(VehicleDocumentType, dt_id)
    if not vdt:
        raise HTTPException(status_code=404, detail="Tipo de documento no encontrado.")
    if vdt not in svc.required_document_types:
        svc.required_document_types.append(vdt)
        await db.commit()
    result = await db.execute(
        select(VehicleService)
        .options(selectinload(VehicleService.required_document_types))
        .where(VehicleService.id == service_id)
    )
    return result.scalar_one()


@router.delete(
    "/{service_id}/document-types/{dt_id}", response_model=VehicleServiceRead, dependencies=_W
)
async def remove_document_type_from_service(
    service_id: int,
    dt_id: int,
    db: AsyncSession = Depends(get_db),
):
    svc = await _get_service_or_404(service_id, db)
    svc.required_document_types = [vdt for vdt in svc.required_document_types if vdt.id != dt_id]
    await db.commit()
    result = await db.execute(
        select(VehicleService)
        .options(selectinload(VehicleService.required_document_types))
        .where(VehicleService.id == service_id)
    )
    return result.scalar_one()


@router.post(
    "/{service_id}/vehicles/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=_W
)
async def assign_vehicle_to_service(
    service_id: int,
    vehicle_id: int,
    db: AsyncSession = Depends(get_db),
):
    svc = await db.get(VehicleService, service_id)
    if not svc:
        raise HTTPException(status_code=404, detail="Servicio no encontrado.")
    vehicle = await db.get(Vehicle, vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado.")
    vehicle.vehicle_service_id = service_id
    await db.commit()


@router.delete(
    "/{service_id}/vehicles/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=_W
)
async def unassign_vehicle_from_service(
    service_id: int,
    vehicle_id: int,
    db: AsyncSession = Depends(get_db),
):
    vehicle = await db.get(Vehicle, vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado.")
    if vehicle.vehicle_service_id == service_id:
        vehicle.vehicle_service_id = None
        await db.commit()
