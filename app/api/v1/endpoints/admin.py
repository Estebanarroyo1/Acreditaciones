"""
Admin-only endpoints — not meant for production exposure.
Useful for testing the notification job without waiting for the cron trigger.
"""
from fastapi import APIRouter, status
from pydantic import BaseModel

router = APIRouter(prefix="/admin", tags=["admin"])


class JobResult(BaseModel):
    status: str
    detail: str


@router.post(
    "/run-notifications",
    response_model=JobResult,
    status_code=status.HTTP_200_OK,
    summary="Ejecutar el job de notificaciones manualmente",
)
async def trigger_notifications() -> JobResult:
    from app.services.notification_job import run_daily_notifications
    try:
        await run_daily_notifications()
        return JobResult(status="ok", detail="Job ejecutado correctamente.")
    except Exception as exc:
        return JobResult(status="error", detail=str(exc))
