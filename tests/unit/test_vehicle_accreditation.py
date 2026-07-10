"""
Unit tests for app/services/vehicle_accreditation.py.

All tested functions are module-level pure helpers — no database involved.
We import them directly (they are "private" by convention, not enforcement).
"""
from datetime import date, timedelta

from app.models.associations import DocumentStatus
from app.models.vehicle_document import VehicleDocument
from app.models.vehicle_document_type import VehicleDocumentType
from app.schemas.vehicle_profile import VehicleDocumentCheck
from app.services.vehicle_accreditation import (
    _doc_traffic_light,
    _effective_alert_days,
    _evaluate_doc,
    _maintenance_light,
    _worst_traffic,
)

_TODAY = date(2024, 7, 1)
_GLOBAL_DAYS = 30


# ── helpers ───────────────────────────────────────────────────────────────────

def _vdt(*, override=None):
    return VehicleDocumentType(
        id=1, name="SOAP", is_active=True, is_required_base=True,
        alert_days_override=override,
    )


def _vdoc(*, status=DocumentStatus.APPROVED, expiry=None, custom_days=None):
    return VehicleDocument(
        id=1, vehicle_id=1, vehicle_document_type_id=1,
        file_path="f.pdf", original_filename="f.pdf",
        status=status,
        expiry_date=expiry,
        custom_alert_days=custom_days,
    )


# ── _worst_traffic ────────────────────────────────────────────────────────────

class TestWorstTraffic:
    def test_red_dominates_all(self):
        assert _worst_traffic("green", "yellow", "red") == "red"

    def test_yellow_beats_green(self):
        assert _worst_traffic("green", "yellow") == "yellow"

    def test_all_green_returns_green(self):
        assert _worst_traffic("green", "green") == "green"

    def test_all_none_returns_none(self):
        assert _worst_traffic(None, None) is None

    def test_no_args_returns_none(self):
        assert _worst_traffic() is None

    def test_none_mixed_with_value_ignores_none(self):
        assert _worst_traffic(None, "green") == "green"

    def test_red_with_none_is_red(self):
        assert _worst_traffic(None, "red") == "red"


# ── _effective_alert_days ─────────────────────────────────────────────────────

class TestEffectiveAlertDays:
    def test_doc_custom_takes_highest_priority(self):
        doc = _vdoc(custom_days=10)
        vdt = _vdt(override=20)
        assert _effective_alert_days(doc, vdt, _GLOBAL_DAYS) == 10

    def test_type_override_beats_global(self):
        doc = _vdoc(custom_days=None)
        vdt = _vdt(override=20)
        assert _effective_alert_days(doc, vdt, _GLOBAL_DAYS) == 20

    def test_global_is_last_resort(self):
        doc = _vdoc(custom_days=None)
        vdt = _vdt(override=None)
        assert _effective_alert_days(doc, vdt, _GLOBAL_DAYS) == _GLOBAL_DAYS

    def test_none_doc_falls_back_to_type_then_global(self):
        vdt = _vdt(override=15)
        assert _effective_alert_days(None, vdt, _GLOBAL_DAYS) == 15


# ── _evaluate_doc ─────────────────────────────────────────────────────────────

class TestEvaluateDoc:
    def test_rejected_status_is_missing(self):
        doc = _vdoc(status=DocumentStatus.REJECTED, expiry=date(2025, 1, 1))
        status, days = _evaluate_doc(doc, _vdt(), _TODAY, _GLOBAL_DAYS)
        assert status == "missing"
        assert days is None

    def test_no_expiry_date_is_ok(self):
        doc = _vdoc(expiry=None)
        status, days = _evaluate_doc(doc, _vdt(), _TODAY, _GLOBAL_DAYS)
        assert status == "ok"
        assert days is None

    def test_expired_doc_returns_expired_with_negative_days(self):
        doc = _vdoc(expiry=date(2024, 1, 1))
        status, days = _evaluate_doc(doc, _vdt(), _TODAY, _GLOBAL_DAYS)
        assert status == "expired"
        assert days is not None and days < 0

    def test_expiring_within_threshold_returns_expiring_soon(self):
        # 19 days remaining, 30-day threshold → expiring_soon
        expiry = _TODAY + timedelta(days=19)
        doc = _vdoc(expiry=expiry)
        status, days = _evaluate_doc(doc, _vdt(), _TODAY, _GLOBAL_DAYS)
        assert status == "expiring_soon"
        assert days == 19

    def test_at_exact_threshold_boundary_is_expiring_soon(self):
        expiry = _TODAY + timedelta(days=30)
        doc = _vdoc(expiry=expiry)
        status, days = _evaluate_doc(doc, _vdt(), _TODAY, _GLOBAL_DAYS)
        assert status == "expiring_soon"
        assert days == 30

    def test_one_day_beyond_threshold_is_ok(self):
        expiry = _TODAY + timedelta(days=31)
        doc = _vdoc(expiry=expiry)
        status, days = _evaluate_doc(doc, _vdt(), _TODAY, _GLOBAL_DAYS)
        assert status == "ok"

    def test_doc_custom_alert_days_overrides_global(self):
        # Custom alert = 5 days; 10 remaining → would be ok with 30-day global,
        # but also ok with 5-day custom
        expiry = _TODAY + timedelta(days=10)
        doc = _vdoc(expiry=expiry, custom_days=5)
        status, days = _evaluate_doc(doc, _vdt(), _TODAY, _GLOBAL_DAYS)
        assert status == "ok"

    def test_doc_custom_alert_days_triggers_expiring_soon(self):
        # Custom alert = 15 days; 10 remaining → expiring_soon
        expiry = _TODAY + timedelta(days=10)
        doc = _vdoc(expiry=expiry, custom_days=15)
        status, days = _evaluate_doc(doc, _vdt(), _TODAY, _GLOBAL_DAYS)
        assert status == "expiring_soon"


# ── _maintenance_light ────────────────────────────────────────────────────────

class TestMaintenanceLight:
    def test_overdue_returns_red(self):
        assert _maintenance_light(1001.0, 1000.0, 800.0, _GLOBAL_DAYS) == "red"

    def test_at_exact_next_service_returns_red(self):
        assert _maintenance_light(1000.0, 1000.0, 800.0, _GLOBAL_DAYS) == "red"

    def test_within_alert_window_returns_yellow(self):
        # life_cycle = 1000-800 = 200; remaining = 1000-980 = 20 ≤ 30 → yellow
        assert _maintenance_light(980.0, 1000.0, 800.0, _GLOBAL_DAYS) == "yellow"

    def test_well_before_service_returns_green(self):
        # remaining = 100 >> 30 → green
        assert _maintenance_light(900.0, 1000.0, 800.0, _GLOBAL_DAYS) == "green"

    def test_no_last_service_skips_yellow_check_returns_green(self):
        # Without last_service_meter we cannot compute life_cycle → skip warning → green
        # (even though remaining=20 would normally trigger yellow)
        assert _maintenance_light(980.0, 1000.0, None, _GLOBAL_DAYS) == "green"


# ── _doc_traffic_light ────────────────────────────────────────────────────────

def _check(status: str) -> VehicleDocumentCheck:
    return VehicleDocumentCheck(
        vehicle_document_type_id=1,
        vehicle_document_type_name="Test",
        check_status=status,
    )


class TestDocTrafficLight:
    def test_empty_list_returns_none(self):
        assert _doc_traffic_light([]) is None

    def test_expired_gives_red(self):
        assert _doc_traffic_light([_check("expired")]) == "red"

    def test_missing_gives_red(self):
        assert _doc_traffic_light([_check("missing")]) == "red"

    def test_expiring_soon_gives_yellow(self):
        assert _doc_traffic_light([_check("expiring_soon")]) == "yellow"

    def test_pending_review_gives_yellow(self):
        assert _doc_traffic_light([_check("pending_review")]) == "yellow"

    def test_ok_gives_green(self):
        assert _doc_traffic_light([_check("ok")]) == "green"

    def test_red_dominates_yellow_in_mixed_list(self):
        checks = [_check("expiring_soon"), _check("expired")]
        assert _doc_traffic_light(checks) == "red"

    def test_yellow_dominates_green_in_mixed_list(self):
        checks = [_check("ok"), _check("expiring_soon")]
        assert _doc_traffic_light(checks) == "yellow"
