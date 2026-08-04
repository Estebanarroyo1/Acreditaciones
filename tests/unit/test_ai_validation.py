"""Unit tests para app/services/ai_validation.combine (silencio/aviso/conflicto)."""

from app.services.ai_validation import Dimension, combine, normalize_verdict


def _t(v, **kw):
    return Dimension(key="type", verdict=v, expected="Licencia", detected=kw.get("detected"),
                     reasoning=kw.get("reasoning"))


def _i(v, **kw):
    return Dimension(key="identity", verdict=v, expected="Juan Pérez",
                     detected=kw.get("detected"), reasoning=kw.get("reasoning"))


def test_normalize_verdict_degrades():
    assert normalize_verdict("MATCH") == "match"
    assert normalize_verdict(" mismatch ") == "mismatch"
    assert normalize_verdict("inventado") == "not_found"
    assert normalize_verdict(None) == "not_found"


def test_both_match_is_silent():
    r = combine([_t("match"), _i("match")])
    assert r.action == "silent"
    assert r.warnings == []
    assert r.conflict is None


def test_identity_not_found_is_silent():
    r = combine([_t("match"), _i("not_found")])
    assert r.action == "silent"


def test_empty_dimensions_is_silent():
    assert combine([]).action == "silent"


def test_likely_match_is_warn():
    r = combine([_t("match"), _i("likely_match", reasoning="solo un apellido")])
    assert r.action == "warn"
    assert len(r.warnings) == 1
    assert r.warnings[0]["dimension"] == "identity"
    assert r.warnings[0]["level"] == "info"
    assert r.warnings[0]["reasoning"] == "solo un apellido"


def test_two_likely_match_two_warnings():
    r = combine([_t("likely_match"), _i("likely_match")])
    assert r.action == "warn"
    assert {w["dimension"] for w in r.warnings} == {"type", "identity"}


def test_identity_mismatch_is_conflict():
    r = combine([_t("match"), _i("mismatch", detected="Otra Persona", reasoning="otro nombre")])
    assert r.action == "conflict"
    assert r.conflict["retryable"] is True
    assert r.conflict["override_field"] == "force_validation_override"
    assert "identity" in r.conflict
    assert r.conflict["identity"] == {
        "expected_name": "Juan Pérez", "detected_name": "Otra Persona", "reasoning": "otro nombre",
    }
    assert "type" not in r.conflict  # el tipo estaba match


def test_type_mismatch_is_conflict():
    r = combine([_t("mismatch", detected="Contrato", reasoning="es un contrato"), _i("match")])
    assert r.action == "conflict"
    assert r.conflict["type"] == {
        "expected": "Licencia", "detected": "Contrato", "reasoning": "es un contrato",
    }
    assert "identity" not in r.conflict


def test_both_mismatch_conflict_has_both():
    r = combine([_t("mismatch"), _i("mismatch")])
    assert r.action == "conflict"
    assert "type" in r.conflict and "identity" in r.conflict


def test_mismatch_wins_over_likely():
    # peor de {likely, mismatch} == mismatch → conflict.
    r = combine([_t("likely_match"), _i("mismatch")])
    assert r.action == "conflict"


def test_notes_aggregate_reasoning():
    r = combine([_t("match"), _i("likely_match", reasoning="dudoso")])
    assert r.notes and "identity=likely_match" in r.notes
    assert combine([_t("match"), _i("match")]).notes is None
