import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings
from app.main import create_app


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app(Settings(_env_file=None, environment="test")))


def test_health_contract(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "nexo-api", "version": "0.1.0"}


def test_openapi_publishes_health_route(client: TestClient) -> None:
    response = client.get("/openapi.json")
    assert "/health" in response.json()["paths"]


def test_cors_accepts_local_frontend(client: TestClient) -> None:
    response = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_cors_rejects_unconfigured_origin(client: TestClient) -> None:
    response = client.options(
        "/health",
        headers={"Origin": "https://example.com", "Access-Control-Request-Method": "GET"},
    )
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_invalid_environment_fails_early() -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, environment="invalid")
