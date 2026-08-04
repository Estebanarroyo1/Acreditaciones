"""Unit tests — resolución de fechas de documentos (carga manual, sin IA).

Cubre `resolve_document_dates` (subida, estricta) y `recompute_edit_dates`
(edición parcial, tolerante) de `app/services/worker_documents.py`.
"""

from datetime import date, timedelta

import pytest
from fastapi import HTTPException

from app.services.worker_documents import recompute_edit_dates, resolve_document_dates


class TestResolveDocumentDates:
    def test_validity_computes_expiry_from_issue(self):
        issue = date.today()
        parsed_issue, parsed_expiry = resolve_document_dates(issue.isoformat(), None, 365)
        assert parsed_issue == issue
        assert parsed_expiry == issue + timedelta(days=365)

    def test_validity_ignores_manual_expiry(self):
        issue = date.today()
        manual = (issue + timedelta(days=10)).isoformat()
        _, parsed_expiry = resolve_document_dates(issue.isoformat(), manual, 365)
        # Con vigencia configurada, el vencimiento manual se ignora (se calcula).
        assert parsed_expiry == issue + timedelta(days=365)

    def test_validity_without_issue_is_422(self):
        with pytest.raises(HTTPException) as exc:
            resolve_document_dates(None, None, 365)
        assert exc.value.status_code == 422

    def test_no_validity_manual_expiry_is_respected(self):
        expiry = date.today() + timedelta(days=30)
        parsed_issue, parsed_expiry = resolve_document_dates(None, expiry.isoformat(), None)
        assert parsed_issue is None
        assert parsed_expiry == expiry

    def test_no_validity_without_expiry_is_422(self):
        with pytest.raises(HTTPException) as exc:
            resolve_document_dates(date.today().isoformat(), None, None)
        assert exc.value.status_code == 422

    def test_expired_document_is_blocked_400(self):
        past = (date.today() - timedelta(days=5)).isoformat()
        with pytest.raises(HTTPException) as exc:
            resolve_document_dates(None, past, None)
        assert exc.value.status_code == 400

    def test_expired_by_validity_is_blocked_400(self):
        old_issue = (date.today() - timedelta(days=400)).isoformat()
        with pytest.raises(HTTPException) as exc:
            resolve_document_dates(old_issue, None, 365)  # expiry = issue+365 < hoy
        assert exc.value.status_code == 400

    def test_bad_date_format_is_422(self):
        with pytest.raises(HTTPException) as exc:
            resolve_document_dates("2020/01/01", None, 365)
        assert exc.value.status_code == 422


class TestRecomputeEditDates:
    def test_no_dates_keeps_current(self):
        cur_i, cur_e = date(2024, 1, 1), date(2024, 12, 31)
        issue, expiry = recompute_edit_dates(None, None, None, cur_i, cur_e)
        assert issue == cur_i
        assert expiry == cur_e

    def test_validity_recomputes_from_existing_issue(self):
        cur_i, cur_e = date(2024, 1, 1), date(2024, 6, 1)
        _, expiry = recompute_edit_dates(None, None, 365, cur_i, cur_e)
        assert expiry == cur_i + timedelta(days=365)

    def test_new_issue_recomputes_expiry_by_validity(self):
        issue, expiry = recompute_edit_dates("2025-01-01", None, 365, date(2020, 1, 1), None)
        assert issue == date(2025, 1, 1)
        assert expiry == date(2025, 1, 1) + timedelta(days=365)

    def test_manual_expiry_without_validity(self):
        _, expiry = recompute_edit_dates(None, "2026-01-01", None, None, date(2024, 1, 1))
        assert expiry == date(2026, 1, 1)

    def test_edit_does_not_block_past_dates(self):
        # La edición es tolerante: no aplica el escudo de vigencia.
        issue, expiry = recompute_edit_dates(None, "2000-01-01", None, None, None)
        assert expiry == date(2000, 1, 1)

    def test_bad_format_is_422(self):
        with pytest.raises(HTTPException) as exc:
            recompute_edit_dates("no-es-fecha", None, None, None, None)
        assert exc.value.status_code == 422
