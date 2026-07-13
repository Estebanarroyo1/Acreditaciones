"""Integration tests — vehicle_services endpoints require authentication."""
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.v1.endpoints import vehicle_services

# Minimal app with only the vehicle_services router — no lifespan/scheduler needed.
_app = FastAPI()
_app.include_router(vehicle_services.router)

ROUTES = [
    ("GET",    "/vehicle-services/"),
    ("GET",    "/vehicle-services/1"),
    ("POST",   "/vehicle-services/"),
    ("PATCH",  "/vehicle-services/1"),
    ("DELETE", "/vehicle-services/1"),
    ("POST",   "/vehicle-services/1/document-types/1"),
    ("DELETE", "/vehicle-services/1/document-types/1"),
    ("POST",   "/vehicle-services/1/vehicles/1"),
    ("DELETE", "/vehicle-services/1/vehicles/1"),
]


@pytest.mark.parametrize("method,path", ROUTES)
async def test_unauthenticated_request_is_rejected(method: str, path: str):
    async with AsyncClient(transport=ASGITransport(app=_app), base_url="http://test") as client:
        r = await client.request(method, path)
    assert r.status_code in (401, 403), (
        f"{method} {path} debe rechazar sin token, got {r.status_code}"
    )
