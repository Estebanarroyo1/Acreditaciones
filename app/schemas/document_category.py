from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DocumentCategoryBase(BaseModel):
    name: str
    description: str | None = None


class DocumentCategoryCreate(DocumentCategoryBase):
    pass


class DocumentCategoryUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class DocumentCategoryRead(DocumentCategoryBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
