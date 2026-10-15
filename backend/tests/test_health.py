from app.database import get_db
from app.main import app


def test_health_ok(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_health_returns_503_when_database_is_down(client):
    class BrokenSession:
        def execute(self, *args, **kwargs):
            raise RuntimeError("db is down")

    def broken_db():
        yield BrokenSession()

    app.dependency_overrides[get_db] = broken_db
    response = client.get("/api/health")
    assert response.status_code == 503


def test_cors_allows_frontend_origin_and_owner_header(client):
    response = client.options(
        "/api/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "x-owner-id",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
