from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from app.models.worker import WorkLocation


class BulkUploadError(BaseModel):
    row: int
    dni: str | None = None
    error: str


class BulkUploadResult(BaseModel):
    total_processed: int
    created: int
    errors: list[BulkUploadError]


class WorkerBase(BaseModel):
    first_name: str
    last_name: str
    dni: str
    email: EmailStr | None = None
    phone: str | None = None
    birth_date: date | None = None
    work_location: WorkLocation
    is_active: bool = True


class WorkerCreate(WorkerBase):
    pass


class WorkerUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    birth_date: date | None = None
    work_location: WorkLocation | None = None
    is_active: bool | None = None


class WorkerRead(WorkerBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
    meets_base_requirements: bool | None = None
