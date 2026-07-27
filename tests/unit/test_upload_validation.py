"""
Unit tests para la validación de archivos subidos (defensa XSS almacenado).

Cubre validate_upload (lista blanca de extensiones + verificación por magic
bytes) y resolve_media_type (media_type de confianza al servir).
"""
import pytest
from fastapi import HTTPException

from app.services.storage import resolve_media_type, validate_upload

# ── Muestras mínimas con firma binaria válida por formato ────────────────────
PDF_BYTES = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
JPEG_BYTES = b"\xff\xd8\xff\xe0\x00\x10JFIF" + b"\x00" * 16
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 24
WEBP_BYTES = b"RIFF" + b"\x24\x00\x00\x00" + b"WEBP" + b"VP8 " + b"\x00" * 16

# Contenido malicioso: HTML con script
HTML_BYTES = b"<html><body><script>alert(document.cookie)</script></body></html>"


# ── Archivos válidos → devuelve el MIME canónico ─────────────────────────────
@pytest.mark.parametrize(
    "filename,content,expected_mime",
    [
        ("acta.pdf", PDF_BYTES, "application/pdf"),
        ("foto.jpg", JPEG_BYTES, "image/jpeg"),
        ("foto.jpeg", JPEG_BYTES, "image/jpeg"),
        ("captura.png", PNG_BYTES, "image/png"),
        ("imagen.webp", WEBP_BYTES, "image/webp"),
        ("ACTA.PDF", PDF_BYTES, "application/pdf"),  # extensión en mayúsculas
    ],
)
def test_valid_files_return_canonical_mime(filename, content, expected_mime):
    assert validate_upload(content, filename) == expected_mime


# ── Extensión fuera de la lista blanca → 422 ─────────────────────────────────
@pytest.mark.parametrize("filename", ["evil.html", "script.js", "malware.exe", "archivo", "doc.svg"])
def test_disallowed_extension_rejected(filename):
    with pytest.raises(HTTPException) as exc:
        validate_upload(PDF_BYTES, filename)
    assert exc.value.status_code == 422


# ── Firma que no coincide con la extensión declarada → 422 ───────────────────
def test_html_renamed_to_pdf_rejected():
    with pytest.raises(HTTPException) as exc:
        validate_upload(HTML_BYTES, "inocente.pdf")
    assert exc.value.status_code == 422


def test_png_content_with_jpg_extension_rejected():
    with pytest.raises(HTTPException) as exc:
        validate_upload(PNG_BYTES, "foto.jpg")
    assert exc.value.status_code == 422


def test_pdf_content_with_png_extension_rejected():
    with pytest.raises(HTTPException) as exc:
        validate_upload(PDF_BYTES, "captura.png")
    assert exc.value.status_code == 422


def test_webp_missing_webp_marker_rejected():
    fake_webp = b"RIFF" + b"\x24\x00\x00\x00" + b"AVI " + b"\x00" * 16
    with pytest.raises(HTTPException) as exc:
        validate_upload(fake_webp, "imagen.webp")
    assert exc.value.status_code == 422


# ── resolve_media_type: media_type de confianza para servir ──────────────────
def test_resolve_media_type_trusts_whitelisted_mime():
    assert resolve_media_type("application/pdf", "x.pdf") == "application/pdf"


def test_resolve_media_type_falls_back_to_extension():
    # MIME almacenado no confiable → se deriva de la extensión conocida
    assert resolve_media_type("application/octet-stream", "x.png") == "image/png"


def test_resolve_media_type_returns_none_for_unknown():
    # Ni MIME confiable ni extensión conocida → None (endpoint fuerza attachment)
    assert resolve_media_type("application/octet-stream", "x.bin") is None
