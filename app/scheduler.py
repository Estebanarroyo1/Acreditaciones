import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.core.config import settings

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone=settings.SCHEDULER_TIMEZONE)


def setup_scheduler() -> None:
    from app.services.notification_job import run_daily_notifications

    scheduler.add_job(
        run_daily_notifications,
        trigger=CronTrigger(
            hour=settings.NOTIFICATION_HOUR,
            minute=settings.NOTIFICATION_MINUTE,
            timezone=settings.SCHEDULER_TIMEZONE,
        ),
        id="daily_notifications",
        name="Daily accreditation alert emails",
        replace_existing=True,
        misfire_grace_time=3600,  # tolerate up to 1 h late start (e.g. server restart)
    )
    logger.info(
        "Scheduler configured — job runs daily at %02d:%02d (%s)",
        settings.NOTIFICATION_HOUR,
        settings.NOTIFICATION_MINUTE,
        settings.SCHEDULER_TIMEZONE,
    )
