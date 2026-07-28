"""Integration test — el manejador global de excepciones responde un 500
genérico y NUNCA filtra el mensaje interno de la excepción al cliente."""
from httpx import ASGITransport, AsyncClient

from app.main import app

_SECRET = "detalle-interno-super-secreto-9d2f1a"


async def _boom():
    raise RuntimeError(_SECRET)


# Ruta descartable que fuerza una excepción NO controlada (no HTTPException).
app.add_api_route("/_test_boom", _boom, methods=["GET"])


async def test_unhandled_exception_returns_generic_500_without_internal_message():
    # raise_app_exceptions=False → httpx devuelve la respuesta 500 emitida por el
    # handler en vez de re-lanzar la excepción (que ServerErrorMiddleware relanza
    # para que el servidor la loggee).
    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/_test_boom")

    assert r.status_code == 500
    assert r.json() == {"detail": "Error interno del servidor."}
    # El mensaje interno de la excepción no debe aparecer en la respuesta.
    assert _SECRET not in r.text
