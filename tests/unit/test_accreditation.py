"""
Unit tests for app/services/accreditation.py.

_classify_doc is a module-level pure function: it receives plain Python objects
and returns a DocumentCheck without touching the database.  We create minimal
SQLAlchemy model instances (no session needed — just Python objects) and call
the function directly.

The ACHS-validity constant and DocumentType.effective_validity_days property
are also covered here because they feed directly into _classify_doc.
"""
from datetime import date, timedelta

from app.models.associations import DocumentStatus, WorkerDocument
from app.models.document_type import ACHS_VALIDITY_DAYS, DocumentType
from app.schemas.accreditation import DocumentCheckStatus
from app.services.accreditation import _classify_doc

# ── helpers ───────────────────────────────────────────────────────────────────

_TODAY = date(2024, 7, 1)
_GLOBAL_PCT = 20


def _dt(*, is_achs=False, validity_days=365, override=None):
    return DocumentType(
        id=1,
        name="Contrato de Trabajo",
        is_achs=is_achs,
        validity_days=validity_days,
        alert_percentage_override=override,
        is_global_base_requirement=True,
        is_active=True,
    )


def _doc(*, status=DocumentStatus.APPROVED, issue=None, expiry=None, custom_pct=None):
    return WorkerDocument(
        id=10,
        worker_id=1,
        document_type_id=1,
        file_path="f.pdf",
        original_filename="f.pdf",
        status=status,
        issue_date=issue,
        expiry_date=expiry,
        custom_alert_percentage=custom_pct,
    )


# ── ACHS constant and property ────────────────────────────────────────────────

class TestAchsValidity:
    def test_achs_validity_constant_is_365(self):
        assert ACHS_VALIDITY_DAYS == 365

    def test_effective_validity_returns_365_for_achs_regardless_of_stored_value(self):
        # Even if validity_days is set to something else, ACHS always wins
        dt = DocumentType(id=1, name="Examen", is_achs=True, validity_days=180)
        assert dt.effective_validity_days == ACHS_VALIDITY_DAYS

    def test_effective_validity_returns_stored_value_for_non_achs(self):
        dt = DocumentType(id=1, name="Contrato", is_achs=False, validity_days=180)
        assert dt.effective_validity_days == 180

    def test_effective_validity_returns_none_for_non_achs_without_days(self):
        dt = DocumentType(id=1, name="Carta", is_achs=False, validity_days=None)
        assert dt.effective_validity_days is None


# ── _classify_doc: missing document ──────────────────────────────────────────

class TestClassifyDocMissing:
    def test_no_doc_gives_missing(self):
        result = _classify_doc(None, _dt(), True, True, _TODAY, _GLOBAL_PCT)
        assert result.check_status == DocumentCheckStatus.MISSING

    def test_missing_fields_are_null(self):
        result = _classify_doc(None, _dt(), True, True, _TODAY, _GLOBAL_PCT)
        assert result.worker_document_id is None
        assert result.expiry_date is None
        assert result.days_until_expiry is None


# ── _classify_doc: pending review ────────────────────────────────────────────

class TestClassifyDocPendingReview:
    def test_uploaded_status_gives_pending_review(self):
        doc = _doc(status=DocumentStatus.UPLOADED)
        result = _classify_doc(doc, _dt(), True, True, _TODAY, _GLOBAL_PCT)
        assert result.check_status == DocumentCheckStatus.PENDING_REVIEW

    def test_pending_status_gives_pending_review(self):
        doc = _doc(status=DocumentStatus.PENDING)
        result = _classify_doc(doc, _dt(), True, True, _TODAY, _GLOBAL_PCT)
        assert result.check_status == DocumentCheckStatus.PENDING_REVIEW


# ── _classify_doc: expiry logic ───────────────────────────────────────────────

class TestClassifyDocExpiry:
    def test_approved_expired_doc_is_expired(self):
        # expired 6 months ago
        doc = _doc(
            issue=date(2023, 1, 1),
            expiry=date(2023, 12, 31),
        )
        result = _classify_doc(doc, _dt(), True, True, _TODAY, _GLOBAL_PCT)
        assert result.check_status == DocumentCheckStatus.EXPIRED
        assert result.days_until_expiry is not None
        assert result.days_until_expiry < 0

    def test_approved_valid_doc_is_ok(self):
        # issued today, valid for 365 days → well within range
        doc = _doc(issue=_TODAY, expiry=_TODAY + timedelta(days=365))
        result = _classify_doc(doc, _dt(), True, True, _TODAY, _GLOBAL_PCT)
        assert result.check_status == DocumentCheckStatus.OK

    def test_approved_expiring_soon_is_expiring_soon(self):
        # 366-day window, 20% threshold = 73 days; 42 days remaining
        issue = date(2024, 1, 1)
        expiry = date(2025, 1, 1)
        today = expiry - timedelta(days=42)
        doc = _doc(issue=issue, expiry=expiry)
        result = _classify_doc(doc, _dt(validity_days=365), True, True, today, _GLOBAL_PCT)
        assert result.check_status == DocumentCheckStatus.EXPIRING_SOON

    def test_no_expiry_date_and_no_validity_gives_ok(self):
        # Document without any expiry information → considered valid indefinitely
        doc = _doc(expiry=None)
        dt = _dt(validity_days=None)
        result = _classify_doc(doc, dt, True, True, _TODAY, _GLOBAL_PCT)
        assert result.check_status == DocumentCheckStatus.OK
        assert result.days_until_expiry is None

    def test_expiry_computed_from_validity_days_when_no_explicit_expiry(self):
        # issue_date + validity_days used as effective expiry
        issue = date(2024, 6, 1)
        # validity_days=365 → effective expiry ≈ 2025-06-01 (335 days from today 2024-07-01)
        doc = _doc(issue=issue, expiry=None)
        result = _classify_doc(doc, _dt(validity_days=365), True, True, _TODAY, _GLOBAL_PCT)
        # 335 days remaining >> 73-day threshold → OK
        assert result.check_status == DocumentCheckStatus.OK

    def test_expires_today_is_expiring_soon_not_expired(self):
        # days_remaining = 0; expired check is `< today` (strict less-than),
        # so today's expiry is NOT yet expired — it falls into EXPIRING_SOON
        today = _TODAY
        doc = _doc(issue=today - timedelta(days=365), expiry=today)
        result = _classify_doc(doc, _dt(), True, True, today, _GLOBAL_PCT)
        assert result.check_status == DocumentCheckStatus.EXPIRING_SOON

    def test_achs_doc_uses_365_day_validity_ignoring_explicit_expiry_field(self):
        # ACHS doc: effective_validity_days overrides the stored validity_days.
        # issue_date 300 days ago → effective expiry = issue + 365 = 65 days from now
        issue = _TODAY - timedelta(days=300)
        doc = _doc(issue=issue, expiry=None)
        dt_achs = _dt(is_achs=True)
        # threshold = 20% of 365 = 73 days; 65 remaining ≤ 73 → EXPIRING_SOON
        result = _classify_doc(doc, dt_achs, True, True, _TODAY, _GLOBAL_PCT)
        assert result.check_status == DocumentCheckStatus.EXPIRING_SOON

    def test_mandatory_flag_preserved_in_result(self):
        result = _classify_doc(None, _dt(), True, True, _TODAY, _GLOBAL_PCT)
        assert result.is_mandatory is True

    def test_non_mandatory_flag_preserved_in_result(self):
        result = _classify_doc(None, _dt(), False, False, _TODAY, _GLOBAL_PCT)
        assert result.is_mandatory is False
