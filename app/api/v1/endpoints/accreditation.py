from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.pagination import Pagination, pagination_params, set_total_count
from app.core.permissions import Module, PermissionLevel, require_module
from app.db.session import get_db
from app.models.associations import WorkerProject
from app.models.project import Project
from app.models.worker import Worker, WorkLocation
from app.schemas.accreditation import AccreditationResponse, WorkerGlobalStatus
from app.services.accreditation import evaluate_accreditation, get_workers_global_status

router = APIRouter(
    prefix="/accreditation",
    tags=["accreditation"],
    dependencies=[Depends(require_module(Module.trabajadores, PermissionLevel.read))],
)


@router.get(
    "/workers/global-status",
    response_model=list[WorkerGlobalStatus],
    summary="Semáforo global de todos los trabajadores (peor estado entre proyectos)",
)
async def get_all_workers_global_status(
    response: Response,
    status: Literal["active", "archived"] = Query("active"),
    location: Literal["planta", "obra"] | None = Query(None),
    pagination: Pagination = Depends(pagination_params),
    db: AsyncSession = Depends(get_db),
):
    location_enum = (
        WorkLocation.PLANTA
        if location == "planta"
        else WorkLocation.OBRA
        if location == "obra"
        else None
    )
    count_q = (
        select(func.count()).select_from(Worker).where(Worker.is_active == (status == "active"))
    )
    if location_enum is not None:
        count_q = count_q.where(Worker.work_location == location_enum)
    total = await db.scalar(count_q)

    items = await get_workers_global_status(
        db,
        status=status,
        location=location_enum,
        limit=pagination.limit,
        offset=pagination.offset,
    )
    set_total_count(response, total or 0)
    return items


@router.get(
    "/{worker_id}/{project_id}",
    response_model=AccreditationResponse,
    summary="Semáforo de acreditación de un trabajador en un proyecto",
)
async def get_accreditation_status(
    worker_id: int,
    project_id: int,
    db: AsyncSession = Depends(get_db),
):
    if not await db.get(Worker, worker_id):
        raise HTTPException(status_code=404, detail="Trabajador no encontrado.")
    if not await db.get(Project, project_id):
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")

    assignment = await db.execute(
        select(WorkerProject).where(
            WorkerProject.worker_id == worker_id,
            WorkerProject.project_id == project_id,
            WorkerProject.is_active == True,
        )
    )
    if not assignment.scalar_one_or_none():
        raise HTTPException(
            status_code=404,
            detail="El trabajador no está asignado a este proyecto.",
        )

    return await evaluate_accreditation(worker_id, project_id, db)
