"""Unit tests — hashing y política de contraseñas (app/core/security.py)."""
import pytest
from fastapi import HTTPException

from app.core.security import (
    hash_password,
    validate_password_strength,
    verify_password,
)


class TestHashing:
    def test_hash_is_not_plaintext(self):
        h = hash_password("supersecret123")
        assert h != "supersecret123"
        assert h.startswith("$2b$")  # bcrypt

    def test_hash_is_salted_unique(self):
        assert hash_password("supersecret123") != hash_password("supersecret123")

    def test_verify_correct_password(self):
        h = hash_password("supersecret123")
        assert verify_password("supersecret123", h) is True

    def test_verify_wrong_password(self):
        h = hash_password("supersecret123")
        assert verify_password("otracosa123", h) is False

    def test_verify_malformed_hash_returns_false(self):
        # Marcador de cuentas migradas sin contraseña utilizable (no es un hash
        # bcrypt válido): debe degradar a False sin lanzar (login falla 401, no 500).
        assert verify_password("cualquier-cosa", "LOCKED_NO_PASSWORD") is False
        assert verify_password("cualquier-cosa", "") is False


class TestPasswordStrength:
    def test_valid_password_passes(self):
        # No debe lanzar.
        validate_password_strength("abcdef1234")

    def test_too_short_raises_422(self):
        with pytest.raises(HTTPException) as exc:
            validate_password_strength("abc12")
        assert exc.value.status_code == 422

    def test_too_long_raises_422(self):
        with pytest.raises(HTTPException) as exc:
            validate_password_strength("a1" + "x" * 71)  # 73 chars > 72
        assert exc.value.status_code == 422

    def test_missing_letter_raises_422(self):
        with pytest.raises(HTTPException) as exc:
            validate_password_strength("1234567890")
        assert exc.value.status_code == 422

    def test_missing_digit_raises_422(self):
        with pytest.raises(HTTPException) as exc:
            validate_password_strength("abcdefghij")
        assert exc.value.status_code == 422
