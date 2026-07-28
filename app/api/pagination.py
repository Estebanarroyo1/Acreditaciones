"""Paginación compartida para los endpoints de listado.

Contrato:
- `limit`: tamaño de página (default 100, máximo 500).
- `offset`: desplazamiento (default 0).
El response conserva su schema actual (lista plana); el total sin paginar se
expone en el header `X-Total-Count` (ver `set_total_count`). El header está
habilitado en CORS (`expose_headers` en app/main.py) para que el frontend pueda
leerlo desde el navegador.
"""
from dataclasses import dataclass

from fastapi import Depends, Query, Response

DEFAULT_LIMIT = 100
MAX_LIMIT = 500
TOTAL_COUNT_HEADER = "X-Total-Count"


@dataclass
class Pagination:
    limit: int
    offset: int


def pagination_params(
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT, description="Tamaño de página (máx. 500)."),
    offset: int = Query(0, ge=0, description="Desplazamiento desde el inicio."),
) -> Pagination:
    return Pagination(limit=limit, offset=offset)


PaginationDep = Depends(pagination_params)


def set_total_count(response: Response, total: int) -> None:
    """Escribe el total de registros (sin paginar) en el header X-Total-Count."""
    response.headers[TOTAL_COUNT_HEADER] = str(total)
