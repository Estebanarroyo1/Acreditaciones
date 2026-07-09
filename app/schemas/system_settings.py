from pydantic import BaseModel, field_validator

_DEFAULT_PCT = 20
_MIN_PCT = 1
_MAX_PCT = 100

_DEFAULT_VEHICLE_DAYS = 30
_MIN_DAYS = 1
_MAX_DAYS = 365


class AlertSettings(BaseModel):
    global_alert_percentage: int = _DEFAULT_PCT


class AlertSettingsUpdate(BaseModel):
    global_alert_percentage: int

    @field_validator("global_alert_percentage")
    @classmethod
    def validate_percentage(cls, v: int) -> int:
        if not (_MIN_PCT <= v <= _MAX_PCT):
            raise ValueError(f"El porcentaje debe estar entre {_MIN_PCT} y {_MAX_PCT}.")
        return v


class VehicleAlertSettings(BaseModel):
    vehicle_global_alert_days: int = _DEFAULT_VEHICLE_DAYS


class VehicleAlertSettingsUpdate(BaseModel):
    vehicle_global_alert_days: int

    @field_validator("vehicle_global_alert_days")
    @classmethod
    def validate_days(cls, v: int) -> int:
        if not (_MIN_DAYS <= v <= _MAX_DAYS):
            raise ValueError(f"Los días deben estar entre {_MIN_DAYS} y {_MAX_DAYS}.")
        return v
