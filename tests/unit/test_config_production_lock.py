"""Unit tests — candado de producción en Settings.

En ENVIRONMENT=production con AUTH_DISABLED=true la app debe NEGARSE A ARRANCAR
(la construcción de Settings falla con ValidationError)."""
import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_production_with_auth_disabled_refuses_to_start():
    with pytest.raises(ValidationError) as exc_info:
        Settings(ENVIRONMENT="production", AUTH_DISABLED=True)
    assert "AUTH_DISABLED" in str(exc_info.value)


def test_production_with_auth_enabled_starts():
    s = Settings(ENVIRONMENT="production", AUTH_DISABLED=False)
    assert s.is_production is True


def test_development_with_auth_disabled_is_allowed():
    s = Settings(ENVIRONMENT="development", AUTH_DISABLED=True)
    assert s.is_production is False
