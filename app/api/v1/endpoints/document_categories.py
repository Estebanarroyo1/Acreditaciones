from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Module, PermissionLevel, require_module
from app.db.session import get_db
from app.models.document_category import DocumentCategory
from app.models.document_type import DocumentType
from app.schemas.document_category import (
    DocumentCategoryCreate,
    DocumentCategoryRead,
    DocumentCategoryUpdate,
)

router = APIRouter(prefix="/document-categories", tags=["document-categories"])

_R = [Depends(require_module(Module.configuracion, PermissionLevel.read))]
_W = [Depends(require_module(Module.configuracion, PermissionLevel.write))]


@router.get("/", response_model=list[DocumentCategoryRead], dependencies=_R)
async def list_document_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DocumentCategory).order_by(DocumentCategory.name))
    return result.scalars().all()


@router.post(
    "/", response_model=DocumentCategoryRead, status_code=status.HTTP_201_CREATED, dependencies=_W
)
async def create_document_category(
    payload: DocumentCategoryCreate, db: AsyncSession = Depends(get_db)
):
    category = DocumentCategory(**payload.model_dump())
    db.add(category)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe una categoría con ese nombre.",
        )
    await db.refresh(category)
    return category


@router.get("/{category_id}", response_model=DocumentCategoryRead, dependencies=_R)
async def get_document_category(category_id: int, db: AsyncSession = Depends(get_db)):
    category = await db.get(DocumentCategory, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Categoría no encontrada.")
    return category


@router.patch("/{category_id}", response_model=DocumentCategoryRead, dependencies=_W)
async def update_document_category(
    category_id: int,
    payload: DocumentCategoryUpdate,
    db: AsyncSession = Depends(get_db),
):
    category = await db.get(DocumentCategory, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Categoría no encontrada.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(category, field, value)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe una categoría con ese nombre.",
        )
    await db.refresh(category)
    return category


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=_W)
async def delete_document_category(category_id: int, db: AsyncSession = Depends(get_db)):
    category = await db.get(DocumentCategory, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Categoría no encontrada.")

    count_result = await db.execute(
        select(func.count()).where(DocumentType.category_id == category_id)
    )
    count = count_result.scalar() or 0
    if count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No se puede eliminar: {count} tipo(s) de documento usan esta categoría.",
        )

    await db.delete(category)
    await db.commit()
