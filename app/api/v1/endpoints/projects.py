from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Module, PermissionLevel, require_module
from app.db.session import get_db
from app.models.project import Project
from app.models.worker import Worker
from app.models.document_type import DocumentType
from app.models.associations import ProjectDocumentType, WorkerProject
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectRead
from app.schemas.worker import WorkerRead
from app.schemas.associations import ProjectRequirementRead

router = APIRouter(prefix="/projects", tags=["projects"])

_R = [Depends(require_module(Module.trabajadores, PermissionLevel.read))]
_W = [Depends(require_module(Module.trabajadores, PermissionLevel.write))]


@router.get("/", response_model=list[ProjectRead], dependencies=_R)
async def list_projects(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.is_active == True))
    return result.scalars().all()


@router.post("/", response_model=ProjectRead, status_code=status.HTTP_201_CREATED, dependencies=_W)
async def create_project(payload: ProjectCreate, db: AsyncSession = Depends(get_db)):
    project = Project(**payload.model_dump())
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project


@router.get("/archived", response_model=list[ProjectRead], dependencies=_R)
async def list_archived_projects(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.is_active == False))
    return result.scalars().all()


@router.get("/{project_id}", response_model=ProjectRead, dependencies=_R)
async def get_project(project_id: int, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.patch("/{project_id}", response_model=ProjectRead, dependencies=_W)
async def update_project(
    project_id: int, payload: ProjectUpdate, db: AsyncSession = Depends(get_db)
):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    await db.commit()
    await db.refresh(project)
    return project


@router.post("/{project_id}/archive", response_model=ProjectRead, dependencies=_W)
async def archive_project(project_id: int, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    project.is_active = False
    await db.commit()
    await db.refresh(project)
    return project


@router.post("/{project_id}/restore", response_model=ProjectRead, dependencies=_W)
async def restore_project(project_id: int, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    project.is_active = True
    await db.commit()
    await db.refresh(project)
    return project


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar proyecto permanentemente",
    dependencies=_W,
)
async def delete_project(project_id: int, db: AsyncSession = Depends(get_db)):
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    await db.delete(project)
    await db.commit()


@router.get(
    "/{project_id}/document-types",
    response_model=list[ProjectRequirementRead],
    summary="Listar tipos de documento requeridos por un proyecto",
    dependencies=_R,
)
async def list_project_requirements(
    project_id: int, db: AsyncSession = Depends(get_db)
):
    if not await db.get(Project, project_id):
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    result = await db.execute(
        select(ProjectDocumentType)
        .where(ProjectDocumentType.project_id == project_id)
        .options(selectinload(ProjectDocumentType.document_type))
    )
    return result.scalars().all()


@router.post(
    "/{project_id}/document-types/{document_type_id}",
    response_model=ProjectRequirementRead,
    status_code=status.HTTP_201_CREATED,
    summary="Agregar tipo de documento requerido al proyecto",
    dependencies=_W,
)
async def add_project_requirement(
    project_id: int,
    document_type_id: int,
    is_mandatory: bool = True,
    db: AsyncSession = Depends(get_db),
):
    if not await db.get(Project, project_id):
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    if not await db.get(DocumentType, document_type_id):
        raise HTTPException(status_code=404, detail="Tipo de documento no encontrado.")

    req = ProjectDocumentType(
        project_id=project_id,
        document_type_id=document_type_id,
        is_mandatory=is_mandatory,
    )
    db.add(req)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ese tipo de documento ya está registrado para el proyecto.",
        )

    result = await db.execute(
        select(ProjectDocumentType)
        .where(ProjectDocumentType.id == req.id)
        .options(selectinload(ProjectDocumentType.document_type))
    )
    return result.scalar_one()


@router.delete(
    "/{project_id}/document-types/{document_type_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Quitar tipo de documento requerido del proyecto",
    dependencies=_W,
)
async def remove_project_requirement(
    project_id: int,
    document_type_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ProjectDocumentType).where(
            ProjectDocumentType.project_id == project_id,
            ProjectDocumentType.document_type_id == document_type_id,
        )
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Requerimiento no encontrado.")
    await db.delete(req)
    await db.commit()


@router.get(
    "/{project_id}/workers",
    response_model=list[WorkerRead],
    summary="Listar trabajadores asignados al proyecto",
    dependencies=_R,
)
async def list_project_workers(project_id: int, db: AsyncSession = Depends(get_db)):
    if not await db.get(Project, project_id):
        raise HTTPException(status_code=404, detail="Proyecto no encontrado.")
    result = await db.execute(
        select(Worker)
        .join(WorkerProject, Worker.id == WorkerProject.worker_id)
        .where(
            WorkerProject.project_id == project_id,
            WorkerProject.is_active == True,
            Worker.is_active == True,
        )
    )
    return result.scalars().all()
