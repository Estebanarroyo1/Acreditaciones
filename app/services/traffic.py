"""
Fuente única de verdad para el semáforo de acreditación compartido entre
trabajadores y vehículos.

Antes, el orden de severidad y la lógica de "peor semáforo de una lista" estaban
duplicados en `accreditation.py` (`_worst`) y `vehicle_accreditation.py`
(`_worst_traffic`), con comportamientos sutilmente distintos ante listas vacías.
Este módulo unifica ambos: el orden vive acá y `worst_traffic_light` cubre los
dos casos de uso vía el parámetro `default`.
"""

from collections.abc import Iterable

from app.schemas.accreditation import TrafficLight

# Orden de severidad canónico: menor índice == peor. Única fuente de verdad.
# red (peor) > yellow > green (mejor).
_SEVERITY: dict[TrafficLight, int] = {
    TrafficLight.RED: 0,
    TrafficLight.YELLOW: 1,
    TrafficLight.GREEN: 2,
}


def worst_traffic_light(
    lights: Iterable[TrafficLight | str | None],
    *,
    default: TrafficLight | None = None,
) -> TrafficLight | None:
    """
    Devuelve el peor semáforo (mayor severidad) de un iterable.

    - Los `None` se ignoran (permite listas heterogéneas con huecos).
    - Si no queda ningún valor válido, devuelve `default`.
        * Trabajadores llaman con `default=TrafficLight.GREEN` (una lista de
          requisitos sin hallazgos == verde), replicando el viejo `_worst`.
        * Vehículos llaman con `default=None` (sin datos == sin semáforo),
          replicando el viejo `_worst_traffic`.
    - Acepta tanto miembros del Enum como los strings equivalentes ("red", ...);
      todo se normaliza a `TrafficLight` antes de comparar.
    """
    valid = [TrafficLight(light) for light in lights if light is not None]
    if not valid:
        return default
    return min(valid, key=lambda light: _SEVERITY[light])
