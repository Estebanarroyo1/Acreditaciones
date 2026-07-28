import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.api.v1.router import api_router
from app.db.session import ping_database
from app.scheduler import scheduler, setup_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_scheduler()
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)


# En producción se desactivan las UIs interactivas de OpenAPI (/docs, /redoc).
_docs_url = None if settings.is_production else "/docs"
_redoc_url = None if settings.is_production else "/redoc"

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_PREFIX}/openapi.json",
    docs_url=_docs_url,
    redoc_url=_redoc_url,
    lifespan=lifespan,
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Cualquier excepción no controlada se loggea completa (con method y path)
    y responde un 500 genérico, sin filtrar stacktrace ni detalles internos.
    Las HTTPException NO pasan por aquí: Starlette las maneja con su handler
    dedicado, así que conservan su status y detail."""
    logger.exception(
        "Excepción no controlada en %s %s", request.method, request.url.path
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "Error interno del servidor."},
    )


@app.get("/health", tags=["health"], summary="Health check para monitoreo externo")
async def health() -> JSONResponse:
    """Endpoint público (sin autenticación, fuera del prefijo v1) para load
    balancers / UptimeRobot. Ejecuta un SELECT 1 con timeout corto: 200 si la BD
    responde, 503 si no."""
    db_ok = await ping_database()
    return JSONResponse(
        status_code=200 if db_ok else 503,
        content={"status": "ok" if db_ok else "error", "database": db_ok},
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Total-Count"],
)

app.include_router(api_router, prefix=settings.API_V1_PREFIX)
