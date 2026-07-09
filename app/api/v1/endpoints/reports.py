from datetime import date

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.associations import DocumentStatus, WorkerDocument
from app.models.document_type import DocumentType
from app.models.project import Project
from app.models.worker import Worker

router = APIRouter(prefix="/reports", tags=["reports"])

_ACTIVE_STATUSES = {DocumentStatus.APPROVED, DocumentStatus.PENDING}


class ExpiringDocumentItem(BaseModel):
    worker_document_id: int
    worker_id: int
    worker_name: str
    worker_dni: str
    document_type_id: int
    document_type_name: str
    category: str
    project_id: int | None
    project_name: str | None
    expiry_date: date
    days_until_expiry: int
    status: DocumentStatus


@router.get("/expiring-documents", response_model=list[ExpiringDocumentItem])
async def get_expiring_documents(
    days_threshold: int = Query(default=30, ge=0, description="Mostrar docs que vencen en N días o menos"),
    worker_id: int | None = Query(default=None),
    project_id: int | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(WorkerDocument)
        .where(
            WorkerDocument.status.in_(_ACTIVE_STATUSES),
            WorkerDocument.expiry_date.is_not(None),
        )
        .options(
            selectinload(WorkerDocument.document_type),
            selectinload(WorkerDocument.worker),
            selectinload(WorkerDocument.project),
        )
        .order_by(WorkerDocument.expiry_date.asc())
    )

    if worker_id is not None:
        stmt = stmt.where(WorkerDocument.worker_id == worker_id)
    if project_id is not None:
        stmt = stmt.where(WorkerDocument.project_id == project_id)

    result = await db.execute(stmt)
    docs = result.scalars().all()

    today = date.today()
    items: list[ExpiringDocumentItem] = []
    for doc in docs:
        days = (doc.expiry_date - today).days
        if days > days_threshold:
            continue
        items.append(ExpiringDocumentItem(
            worker_document_id=doc.id,
            worker_id=doc.worker_id,
            worker_name=f"{doc.worker.first_name} {doc.worker.last_name}",
            worker_dni=doc.worker.dni,
            document_type_id=doc.document_type_id,
            document_type_name=doc.document_type.name,
            category=doc.document_type.category.name if doc.document_type.category else "",
            project_id=doc.project_id,
            project_name=doc.project.name if doc.project else None,
            expiry_date=doc.expiry_date,
            days_until_expiry=days,
            status=doc.status,
        ))

    return items
