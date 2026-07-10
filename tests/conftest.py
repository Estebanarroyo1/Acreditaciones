"""
Shared fixtures for the test suite.

DB strategy: SQLite in-memory via aiosqlite.
All SQLAlchemy models register themselves on Base.metadata when imported through
app.models, so a single create_all() gives a complete schema for each test.
"""
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.models  # noqa: F401 — side-effect: registers all tables on Base.metadata
from app.models.base import Base

_SQLITE_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture
async def db_session() -> AsyncSession:
    engine = create_async_engine(_SQLITE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()
