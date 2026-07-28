import asyncio

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

engine = create_async_engine(
    settings.database_url,
    echo=settings.DEBUG,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session


async def ping_database(timeout: float = 2.0) -> bool:
    """Comprueba la conectividad con la BD ejecutando un `SELECT 1` con timeout
    corto. Devuelve True si responde, False ante cualquier error/timeout.
    Pensado para el endpoint de monitoreo /health (no lanza excepciones)."""
    try:
        async with AsyncSessionLocal() as session:
            await asyncio.wait_for(session.execute(text("SELECT 1")), timeout)
        return True
    except Exception:
        return False
