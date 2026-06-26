"""
HTTP-layer smoke tests using the Flask test client.

These run without a live database: the health endpoint reports
'degraded' when DBs are unreachable (still HTTP 200), and protected
routes must reject unauthenticated requests before touching any DB.
"""


def test_health_returns_200_and_shape(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["status"] in ("healthy", "degraded")
    assert set(body["databases"].keys()) == {"mssql", "starrocks"}
    assert "timestamp" in body


def test_protected_api_requires_auth(client):
    # No session -> the global before_request gate must return 401.
    resp = client.get("/api/chains")
    assert resp.status_code == 401
    body = resp.get_json()
    assert body["code"] == "AUTH_REQUIRED"


def test_auth_routes_are_not_gated(client):
    # /api/auth/* is exempt from the auth gate (should not 401).
    resp = client.get("/api/auth/login")
    assert resp.status_code != 401


def test_index_is_served(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert b"<!DOCTYPE html" in resp.data or b"<html" in resp.data.lower()


def test_static_js_is_served(client):
    resp = client.get("/js/app.js")
    assert resp.status_code == 200
