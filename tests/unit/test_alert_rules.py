"""
Unit tests for app/services/alert_rules.py.

All functions except load_global_pct are pure; they receive plain Python
values and never touch the database.  load_global_pct is tested with the
shared SQLite-in-memory db_session fixture.
"""
import json
from datetime import date, timedelta

import pytest

from app.services.alert_rules import (
    compute_alert_days,
    effective_pct,
    is_expiring_soon,
    load_global_pct,
)
from app.models.document_type import DocumentType
from app.models.associations import WorkerDocument, DocumentStatus
from app.models.system_settings import SystemSetting


# ── compute_alert_days ────────────────────────────────────────────────────────

class TestComputeAlertDays:
    def test_uses_issue_date_for_total_life(self):
        # 2024 is a leap year: 2024-01-01 → 2025-01-01 = 366 days
        expiry = date(2025, 1, 1)
        issue = date(2024, 1, 1)
        result = compute_alert_days(expiry, issue, None, 20)
        assert result == int(366 * 20 / 100)  # 73

    def test_falls_back_to_validity_days_when_no_issue_date(self):
        result = compute_alert_days(date(2025, 1, 1), None, 180, 20)
        assert result == int(180 * 20 / 100)  # 36

    def test_defaults_to_365_when_no_issue_date_and_no_validity_days(self):
        result = compute_alert_days(date(2025, 1, 1), None, None, 20)
        assert result == int(365 * 20 / 100)  # 73

    def test_returns_zero_for_zero_pct(self):
        result = compute_alert_days(date(2025, 1, 1), date(2024, 1, 1), None, 0)
        assert result == 0

    def test_clamps_minimum_total_to_one_day(self):
        # same day → total would be 0, clamped to 1
        same = date(2024, 7, 1)
        result = compute_alert_days(same, same, None, 20)
        assert result == 0  # max(0, int(1 * 20 / 100)) = 0


# ── is_expiring_soon ──────────────────────────────────────────────────────────

class TestIsExpiringSoon:
    # Setup: total = 366 days (leap 2024), threshold at 20% = 73 days

    _expiry = date(2025, 1, 1)
    _issue = date(2024, 1, 1)
    _pct = 20

    def test_within_threshold_returns_true(self):
        # 42 days remaining, threshold = 73 → expiring soon
        today = self._expiry - timedelta(days=42)
        assert is_expiring_soon(self._expiry, self._issue, None, self._pct, today) is True

    def test_outside_threshold_returns_false(self):
        # 200 days remaining, threshold = 73 → not expiring soon
        today = self._expiry - timedelta(days=200)
        assert is_expiring_soon(self._expiry, self._issue, None, self._pct, today) is False

    def test_already_expired_returns_false(self):
        # days_remaining < 0 — document is expired, not "expiring soon"
        today = self._expiry + timedelta(days=1)
        assert is_expiring_soon(self._expiry, self._issue, None, self._pct, today) is False

    def test_at_exact_threshold_boundary_returns_true(self):
        # threshold = 73; remaining == 73 satisfies <=
        today = self._expiry - timedelta(days=73)
        assert is_expiring_soon(self._expiry, self._issue, None, self._pct, today) is True

    def test_one_day_beyond_threshold_returns_false(self):
        today = self._expiry - timedelta(days=74)
        assert is_expiring_soon(self._expiry, self._issue, None, self._pct, today) is False

    def test_expiry_today_returns_true(self):
        # days_remaining = 0, threshold ≥ 0 always → expiring soon (not yet expired)
        today = self._expiry
        assert is_expiring_soon(today, self._issue, None, self._pct, today) is True


# ── effective_pct cascade ─────────────────────────────────────────────────────

class TestEffectivePct:
    def _dt(self, override=None):
        return DocumentType(
            id=1, name="Test", is_achs=False, validity_days=None,
            alert_percentage_override=override,
        )

    def _doc(self, custom=None):
        return WorkerDocument(
            id=1, worker_id=1, document_type_id=1,
            file_path="f.pdf", original_filename="f.pdf",
            status=DocumentStatus.APPROVED,
            custom_alert_percentage=custom,
        )

    def test_document_custom_takes_highest_priority(self):
        assert effective_pct(self._doc(custom=50), self._dt(override=30), 20) == 50

    def test_type_override_beats_global(self):
        assert effective_pct(self._doc(custom=None), self._dt(override=30), 20) == 30

    def test_global_is_last_resort(self):
        assert effective_pct(self._doc(custom=None), self._dt(override=None), 20) == 20

    def test_none_doc_falls_back_to_type_then_global(self):
        assert effective_pct(None, self._dt(override=35), 20) == 35

    def test_none_doc_and_no_type_override_uses_global(self):
        assert effective_pct(None, self._dt(override=None), 25) == 25


# ── load_global_pct (DB-backed) ───────────────────────────────────────────────

class TestLoadGlobalPct:
    async def test_returns_default_20_when_no_setting_exists(self, db_session):
        result = await load_global_pct(db_session)
        assert result == 20

    async def test_reads_custom_value_from_db(self, db_session):
        setting = SystemSetting(key="global_alert_percentage", value=json.dumps(35))
        db_session.add(setting)
        await db_session.commit()
        result = await load_global_pct(db_session)
        assert result == 35
