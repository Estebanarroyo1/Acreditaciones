from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Module, PermissionLevel, require_module
from app.db.session import get_db
from app.models.associations import WorkerDocument
from app.models.document_type import DocumentType
from app.schemas.document_type import (
    DocumentTypeCreate,
    DocumentTypeRead,
    DocumentTypeUpdate,
)

router = APIRouter(prefix="/document-types", tags=["document-types"])

_R = [Depends(require_module(Module.configuracion, PermissionLevel.read))]
_W = [Depends(require_module(Module.configuracion, PermissionLevel.write))]


@router.get("/", response_model=list[DocumentTypeRead], dependencies=_R)
async def list_document_types(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DocumentType).where(DocumentType.is_active == True))
    return result.scalars().all()


@router.post(
    "/", response_model=DocumentTypeRead, status_code=status.HTTP_201_CREATED, dependencies=_W
)
async def create_document_type(payload: DocumentTypeCreate, db: AsyncSession = Depends(get_db)):
    doc_type = DocumentType(**payload.model_dump())
    db.add(doc_type)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un tipo de documento con ese nombre.",
        )
    await db.refresh(doc_type)
    return doc_type


@router.get("/{doc_type_id}", response_model=DocumentTypeRead, dependencies=_R)
async def get_document_type(doc_type_id: int, db: AsyncSession = Depends(get_db)):
    doc_type = await db.get(DocumentType, doc_type_id)
    if not doc_type:
        raise HTTPException(status_code=404, detail="Tipo de documento no encontrado.")
    return doc_type


@router.patch("/{doc_type_id}", response_model=DocumentTypeRead, dependencies=_W)
async def update_document_type(
    doc_type_id: int,
    payload: DocumentTypeUpdate,
    db: AsyncSession = Depends(get_db),
):
    doc_type = await db.get(DocumentType, doc_type_id)
    if not doc_type:
        raise HTTPException(status_code=404, detail="Tipo de documento no encontrado.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(doc_type, field, value)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un tipo de documento con ese nombre.",
        )
    await db.refresh(doc_type)
    return doc_type


@router.delete("/{doc_type_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=_W)
async def delete_document_type(
    doc_type_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete: sets is_active=False if no active (non-archived) worker documents exist."""
    doc_type = await db.get(DocumentType, doc_type_id)
    if not doc_type:
        raise HTTPException(status_code=404, detail="Tipo de documento no encontrado.")

    # Count non-archived worker documents referencing this type
    count_result = await db.execute(
        select(func.count(WorkerDocument.id)).where(
            WorkerDocument.document_type_id == doc_type_id,
            WorkerDocument.is_archived == False,
        )
    )
    active_count = count_result.scalar_one()

    if active_count > 0:
        doc_word = "documento" if active_count == 1 else "documentos"
        act_word = "activo" if active_count == 1 else "activos"
        aso_word = "asociado" if active_count == 1 else "asociados"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"No se puede eliminar este tipo de documento. "
                f"Existen {active_count} {doc_word} {act_word} {aso_word} a trabajadores. "
                f"Debe archivar todos los documentos de este tipo en los perfiles "
                f"correspondientes antes de proceder."
            ),
        )

    doc_type.is_active = False
    await db.commit()
