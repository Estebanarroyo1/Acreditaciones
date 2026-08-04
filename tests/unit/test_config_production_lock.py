"""Unit tests — candado de producción en Settings.

En ENVIRONMENT=production la app debe NEGARSE A ARRANCAR (ValidationError al
construir Settings) si: (a) AUTH_DISABLED=true, o (b) JWT_SECRET_KEY está vacío o
sigue siendo el placeholder de ejemplo."""
import pytest
from pydantic import ValidationError

from app.core.config import INSECURE_JWT_DEFAULT, Settings

# Clave válida para las pruebas que necesitan arrancar en producción.
_REAL_SECRET = "una-clave-secreta-suficientemente-larga-para-produccion-123"


def test_production_with_auth_disabled_refuses_to_start():
    with pytest.raises(ValidationError) as exc_info:
        Settings(ENVIRONMENT="production", AUTH_DISABLED=True, JWT_SECRET_KEY=_REAL_SECRET)
    assert "AUTH_DISABLED" in str(exc_info.value)


def test_production_with_default_jwt_secret_refuses_to_start():
    with pytest.raises(ValidationError) as exc_info:
        Settings(ENVIRONMENT="production", AUTH_DISABLED=False, JWT_SECRET_KEY=INSECURE_JWT_DEFAULT)
    assert "JWT_SECRET_KEY" in str(exc_info.value)


def test_production_with_empty_jwt_secret_refuses_to_start():
    with pytest.raises(ValidationError) as exc_info:
        Settings(ENVIRONMENT="production", AUTH_DISABLED=False, JWT_SECRET_KEY="")
    assert "JWT_SECRET_KEY" in str(exc_info.value)


def test_production_with_real_secret_and_auth_enabled_starts():
    s = Settings(ENVIRONMENT="production", AUTH_DISABLED=False, JWT_SECRET_KEY=_REAL_SECRET)
    assert s.is_production is True


def test_development_with_auth_disabled_is_allowed():
    s = Settings(ENVIRONMENT="development", AUTH_DISABLED=True)
    assert s.is_production is False
