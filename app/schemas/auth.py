from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr


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
    must_change_password: bool
    last_login_at: datetime | None
    permissions: list[PermissionRead]
    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    must_change_password: bool
    user: UserRead


class SetupStatus(BaseModel):
    """Estado de bootstrap: ¿existe ya al menos un admin activo? Sin datos sensibles."""

    has_admin: bool


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class PermissionItem(BaseModel):
    module: str
    level: str


class UserCreate(BaseModel):
    """Alta de usuario por un admin (define la contraseña inicial)."""

    email: EmailStr
    full_name: str | None = None
    password: str
    is_admin: bool = False
    permissions: list[PermissionItem] | None = None


class UserPatch(BaseModel):
    # None = "no modificar este campo" (no se puede fijar full_name a null vía PATCH).
    full_name: str | None = None
    is_active: bool | None = None
    is_admin: bool | None = None


class PasswordReset(BaseModel):
    """Reseteo de contraseña por un admin (para cuando el usuario la olvida)."""

    new_password: str


class PermissionsReplace(BaseModel):
    permissions: list[PermissionItem]
