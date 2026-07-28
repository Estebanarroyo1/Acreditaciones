from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.document_category import DocumentCategoryRead


class DocumentTypeBase(BaseModel):
    name: str
    description: str | None = None
    category_id: int | None = None
    validity_days: int | None = None
    is_active: bool = True
    is_global_base_requirement: bool = False
    alert_percentage_override: int | None = None
    is_achs: bool = False
    achs_category: str | None = None


class DocumentTypeCreate(DocumentTypeBase):
    pass


class DocumentTypeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    category_id: int | None = None
    validity_days: int | None = None
    is_active: bool | None = None
    is_global_base_requirement: bool | None = None
    alert_percentage_override: int | None = None
    is_achs: bool | None = None
    achs_category: str | None = None


class DocumentTypeRead(DocumentTypeBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category: DocumentCategoryRead | None = None
    created_at: datetime
    updated_at: datetime
