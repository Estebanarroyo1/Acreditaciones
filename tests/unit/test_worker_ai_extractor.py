"""
Unit tests para app/services/worker_ai_extractor.extract_dates — verificación de
titular por nombre. Se mockea el cliente de OpenAI (no hay red) y la conversión a
imagen, y se comprueba que `person_match` se parsea a uno de los 4 valores válidos
y que un JSON sin el campo (o con valor inválido) degrada a "not_found" (seguro).
"""
import json

import pytest

from app.services import worker_ai_extractor


class _FakeMessage:
    def __init__(self, content: str):
        self.content = content


class _FakeChoice:
    def __init__(self, content: str):
        self.message = _FakeMessage(content)


class _FakeResponse:
    def __init__(self, content: str):
        self.choices = [_FakeChoice(content)]


class _FakeCompletions:
    def __init__(self, content: str):
        self._content = content

    async def create(self, *args, **kwargs):
        return _FakeResponse(self._content)


class _FakeChat:
    def __init__(self, content: str):
        self.completions = _FakeCompletions(content)


class _FakeClient:
    def __init__(self, content: str):
        self.chat = _FakeChat(content)


@pytest.fixture(autouse=True)
def _stub_image(monkeypatch):
    # Evita depender de PyMuPDF: la "imagen" es irrelevante porque el cliente
    # está mockeado con una respuesta fija.
    async def _fake_to_image(content, mime, filename):
        return b"img-bytes", "image/png"

    monkeypatch.setattr(worker_ai_extractor, "_to_image", _fake_to_image)


def _mock_openai(monkeypatch, payload: dict):
    content = json.dumps(payload)
    monkeypatch.setattr(worker_ai_extractor, "_get_client", lambda: _FakeClient(content))


async def _run(monkeypatch, payload: dict) -> dict:
    _mock_openai(monkeypatch, payload)
    return await worker_ai_extractor.extract_dates(
        b"x", "image/png", "doc.png",
        expected_document_name="Cédula",
        expected_person_name="Juan Pérez González",
    )


@pytest.mark.parametrize("value", ["match", "likely_match", "mismatch", "not_found"])
async def test_person_match_valid_values_parse(monkeypatch, value):
    result = await _run(monkeypatch, {
        "issue_date": None, "expiry_date": None, "document_type_detected": "Cédula",
        "person_name_detected": "Juan Pérez González", "person_match": value,
    })
    assert result["person_match"] == value
    assert result["person_name_detected"] == "Juan Pérez González"


async def test_missing_person_match_degrades_to_not_found(monkeypatch):
    # JSON sin el campo person_match → seguro: not_found, no alarma.
    result = await _run(monkeypatch, {
        "issue_date": "2024-03-15", "expiry_date": "2025-03-15",
        "document_type_detected": "Cédula",
    })
    assert result["person_match"] == "not_found"
    assert result["person_name_detected"] is None


async def test_invalid_person_match_degrades_to_not_found(monkeypatch):
    result = await _run(monkeypatch, {
        "person_name_detected": "Otro", "person_match": "totalmente_inventado",
    })
    assert result["person_match"] == "not_found"


async def test_person_match_case_insensitive(monkeypatch):
    # La IA podría devolver "MISMATCH" / " Match "; se normaliza a minúsculas.
    result = await _run(monkeypatch, {"person_match": "  MISMATCH "})
    assert result["person_match"] == "mismatch"


async def test_dates_still_parsed_alongside_person_fields(monkeypatch):
    result = await _run(monkeypatch, {
        "issue_date": "2024-01-10", "expiry_date": "2026-01-10",
        "document_type_detected": "Certificado", "person_name_detected": "Pedro Soto",
        "person_match": "match",
    })
    assert result["issue_date"] == "2024-01-10"
    assert result["expiry_date"] == "2026-01-10"
    assert result["document_type_detected"] == "Certificado"
    assert result["person_match"] == "match"


async def test_no_expected_name_still_returns_field(monkeypatch):
    # Sin nombre esperado, el contrato sigue devolviendo person_match (not_found).
    _mock_openai(monkeypatch, {"person_match": "not_found", "person_name_detected": None})
    result = await worker_ai_extractor.extract_dates(b"x", "image/png", "d.png")
    assert result["person_match"] == "not_found"
    assert "person_name_detected" in result
