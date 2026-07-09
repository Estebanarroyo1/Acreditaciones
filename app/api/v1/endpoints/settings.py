import json

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.system_settings import SystemSetting
from app.schemas.system_settings import (
    AlertSettings,
    AlertSettingsUpdate,
    VehicleAlertSettings,
    VehicleAlertSettingsUpdate,
)

router = APIRouter(prefix="/settings", tags=["settings"])

_ALERT_KEY = "global_alert_percentage"
_DEFAULT_PCT = 20

_VEHICLE_ALERT_KEY = "vehicle_global_alert_days"
_DEFAULT_VEHICLE_DAYS = 30


async def _get_or_create_setting(db: AsyncSession, key: str, default: int) -> SystemSetting:
    result = await db.execute(select(SystemSetting).where(SystemSetting.key == key))
    setting = result.scalar_one_or_none()
    if setting is None:
        setting = SystemSetting(key=key, value=json.dumps(default))
        db.add(setting)
        await db.commit()
        await db.refresh(setting)
    return setting


@router.get("/alerts", response_model=AlertSettings)
async def get_alert_settings(db: AsyncSession = Depends(get_db)):
    setting = await _get_or_create_setting(db, _ALERT_KEY, _DEFAULT_PCT)
    return AlertSettings(global_alert_percentage=json.loads(setting.value))


@router.patch("/alerts", response_model=AlertSettings)
async def update_alert_settings(
    payload: AlertSettingsUpdate,
    db: AsyncSession = Depends(get_db),
):
    setting = await _get_or_create_setting(db, _ALERT_KEY, _DEFAULT_PCT)
    setting.value = json.dumps(payload.global_alert_percentage)
    await db.commit()
    await db.refresh(setting)
    return AlertSettings(global_alert_percentage=json.loads(setting.value))


@router.get("/vehicle-alerts", response_model=VehicleAlertSettings)
async def get_vehicle_alert_settings(db: AsyncSession = Depends(get_db)):
    setting = await _get_or_create_setting(db, _VEHICLE_ALERT_KEY, _DEFAULT_VEHICLE_DAYS)
    return VehicleAlertSettings(vehicle_global_alert_days=json.loads(setting.value))


@router.patch("/vehicle-alerts", response_model=VehicleAlertSettings)
async def update_vehicle_alert_settings(
    payload: VehicleAlertSettingsUpdate,
    db: AsyncSession = Depends(get_db),
):
    setting = await _get_or_create_setting(db, _VEHICLE_ALERT_KEY, _DEFAULT_VEHICLE_DAYS)
    setting.value = json.dumps(payload.vehicle_global_alert_days)
    await db.commit()
    await db.refresh(setting)
    return VehicleAlertSettings(vehicle_global_alert_days=json.loads(setting.value))
