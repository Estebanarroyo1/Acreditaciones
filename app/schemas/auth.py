from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PermissionRead(BaseModel):
    module: str
    level: str
    model_config = ConfigDict(from_attributes=True)


class UserRead(BaseModel):
    id: int
    email: str
    full_name: str | None
    is_admin: bool
    is_active: bool
    last_login_at: datetime | None
    permissions: list[PermissionRead]
    model_config = ConfigDict(from_attributes=True)


class UserPatch(BaseModel):
    is_active: bool | None = None
    is_admin: bool | None = None


class PermissionItem(BaseModel):
    module: str
    level: str


class PermissionsReplace(BaseModel):
    permissions: list[PermissionItem]
