"""
Shared alert-threshold logic.

Formula:
    total_days = expiry_date - issue_date   (or validity_days as fallback)
    alert_days = total_days * (pct / 100)

The document enters EXPIRING_SOON when days_remaining <= alert_days.
All exposed APIs continue to surface days_remaining, never the percentage.

Priority cascade for the alert percentage:
    1. WorkerDocument.custom_alert_percentage  (document-specific override)
    2. DocumentType.alert_percentage_override  (type-level override)
    3. SystemSettings global_alert_percentage  (global fallback)
"""
import json
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document_type import DocumentType
from app.models.system_settings import SystemSetting

if TYPE_CHECKING:
    from app.models.associations import WorkerDocument

_DEFAULT_PCT = 20
_ALERT_KEY = "global_alert_percentage"


async def load_global_pct(db: AsyncSession) -> int:
    result = await db.execute(select(SystemSetting).where(SystemSetting.key == _ALERT_KEY))
    setting = result.scalar_one_or_none()
    if setting:
        try:
            return int(json.loads(setting.value))
        except Exception:
            pass
    return _DEFAULT_PCT


def effective_pct(
    doc: "WorkerDocument | None",
    dt: DocumentType,
    global_pct: int,
) -> int:
    """
    Returns the alert percentage to use, following the 3-level cascade:
      1. doc.custom_alert_percentage  (highest priority)
      2. dt.alert_percentage_override
      3. global_pct                   (fallback)
    """
    if doc is not None and doc.custom_alert_percentage is not None:
        return doc.custom_alert_percentage
    if dt.alert_percentage_override is not None:
        return dt.alert_percentage_override
    return global_pct


def compute_alert_days(
    expiry_date: date,
    issue_date: date | None,
    validity_days: int | None,
    pct: int,
) -> int:
    """
    Number of days remaining at which to switch to EXPIRING_SOON.
    Uses issue_date for total life; falls back to validity_days; defaults to 365.
    """
    if issue_date is not None:
        total = max(1, (expiry_date - issue_date).days)
    elif validity_days:
        total = validity_days
    else:
        total = 365
    return max(0, int(total * pct / 100))


def is_expiring_soon(
    expiry_date: date,
    issue_date: date | None,
    validity_days: int | None,
    pct: int,
    today: date,
) -> bool:
    days_remaining = (expiry_date - today).days
    if days_remaining < 0:
        return False  # already expired
    threshold = compute_alert_days(expiry_date, issue_date, validity_days, pct)
    return days_remaining <= threshold
