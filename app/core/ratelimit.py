"""
Rate limiting simple en memoria para los endpoints costosos de IA (/ai-scan).

Implementado como dependencia FastAPI: cuenta las llamadas por usuario dentro de
una ventana deslizante de 60 s y responde 429 al exceder AI_SCAN_MAX_PER_MINUTE.

⚠️ El contador vive en el proceso (dict en RAM). Si algún día se corre uvicorn
con múltiples workers, cada worker tendría su propio contador y el límite real
sería N × AI_SCAN_MAX_PER_MINUTE. En ese escenario hay que migrar este estado a
un almacén compartido (Redis) — p. ej. INCR con EXPIRE por clave usuario:minuto.
"""

import time

from fastapi import Depends, HTTPException, status

from app.core.auth import get_current_user
from app.core.config import settings
from app.models.user import User

_WINDOW_SECONDS = 60.0

# {user_id: [monotonic_timestamps]} — timestamps de llamadas dentro de la ventana.
_calls: dict[int, list[float]] = {}


def _prune(now: float) -> None:
    """Elimina timestamps vencidos y descarta usuarios sin llamadas recientes."""
    for uid in list(_calls.keys()):
        fresh = [t for t in _calls[uid] if now - t < _WINDOW_SECONDS]
        if fresh:
            _calls[uid] = fresh
        else:
            del _calls[uid]


async def rate_limit_ai_scan(current_user: User = Depends(get_current_user)) -> User:
    """
    Dependencia FastAPI: registra la llamada del usuario y bloquea con 429 si
    superó AI_SCAN_MAX_PER_MINUTE dentro de la ventana de 60 s.
    """
    now = time.monotonic()
    _prune(now)

    uid = current_user.id
    timestamps = _calls.get(uid, [])
    if len(timestamps) >= settings.AI_SCAN_MAX_PER_MINUTE:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                "Demasiadas solicitudes de análisis con IA. Espera un minuto e inténtalo de nuevo."
            ),
        )

    timestamps.append(now)
    _calls[uid] = timestamps
    return current_user
