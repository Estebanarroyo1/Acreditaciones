"""
Combinación de veredictos de validación por IA (TIPO + IDENTIDAD).

Filosofía **silencio / aviso / confirmación**, SIN bloqueo duro:
- `silent`  → guardar sin ruido.
- `warn`    → guardar + `warnings[]` (nivel "info"), uno por dimensión dudosa.
- `conflict`→ NO guardar aún; el endpoint responde **409** con el detalle de cada
  problema y un flag `retryable` + `override_field`. El usuario con permiso de
  escritura puede reenviar con `force_validation_override=true`.

Escala de veredicto (compartida por tipo e identidad):
`"match" | "likely_match" | "mismatch" | "not_found"`.
`not_found` es neutro (no alarma), igual que `match`.

Trabajadores combinan {tipo, identidad}; vehículos solo {tipo} (no hay persona).
"""

from dataclasses import dataclass, field

_VALID_VERDICTS = {"match", "likely_match", "mismatch", "not_found"}
# Severidad: mayor == peor. match/not_found son neutros.
_SEVERITY = {"match": 0, "not_found": 0, "likely_match": 1, "mismatch": 2}

OVERRIDE_FIELD = "force_validation_override"


def normalize_verdict(value) -> str:
    """Devuelve un veredicto válido; degrada a 'not_found' si falta o es inválido."""
    if isinstance(value, str) and value.strip().lower() in _VALID_VERDICTS:
        return value.strip().lower()
    return "not_found"


@dataclass
class Dimension:
    """Una dimensión evaluada por la IA (tipo o identidad)."""

    key: str  # "type" | "identity"
    verdict: str  # ya normalizado
    reasoning: str | None = None
    expected: str | None = None
    detected: str | None = None


@dataclass
class CombinedValidation:
    action: str  # "silent" | "warn" | "conflict"
    warnings: list[dict] = field(default_factory=list)
    conflict: dict | None = None
    notes: str | None = None  # reasoning agregado para auditoría


def _audit_notes(dimensions: list[Dimension]) -> str | None:
    parts = [
        f"{d.key}={d.verdict}: {d.reasoning}"
        for d in dimensions
        if d.verdict in ("likely_match", "mismatch") and d.reasoning
    ]
    return " | ".join(parts) or None


def combine(dimensions: list[Dimension]) -> CombinedValidation:
    """Toma el PEOR veredicto de las dimensiones y decide la acción."""
    worst = max((_SEVERITY.get(d.verdict, 0) for d in dimensions), default=0)
    notes = _audit_notes(dimensions)

    if worst >= _SEVERITY["mismatch"]:
        conflict: dict = {"retryable": True, "override_field": OVERRIDE_FIELD}
        for d in dimensions:
            if d.verdict != "mismatch":
                continue
            if d.key == "type":
                conflict["type"] = {
                    "expected": d.expected,
                    "detected": d.detected,
                    "reasoning": d.reasoning,
                }
            elif d.key == "identity":
                conflict["identity"] = {
                    "expected_name": d.expected,
                    "detected_name": d.detected,
                    "reasoning": d.reasoning,
                }
        return CombinedValidation(action="conflict", conflict=conflict, notes=notes)

    if worst == _SEVERITY["likely_match"]:
        warnings = [
            {
                "dimension": d.key,
                "level": "info",
                "reasoning": d.reasoning or f"Coincidencia dudosa de {d.key}.",
            }
            for d in dimensions
            if d.verdict == "likely_match"
        ]
        return CombinedValidation(action="warn", warnings=warnings, notes=notes)

    return CombinedValidation(action="silent", notes=notes)
