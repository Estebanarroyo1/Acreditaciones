"""Schemas compartidos de la validación por IA (tipo + identidad)."""

from pydantic import BaseModel


class ValidationWarning(BaseModel):
    """Aviso no bloqueante (nivel 'info') por una dimensión dudosa (likely_match)."""

    dimension: str  # "type" | "identity"
    level: str  # "info"
    reasoning: str
