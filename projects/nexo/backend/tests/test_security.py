from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app.security import SecurityMiddleware


def client() -> TestClient:
    app = FastAPI()
    app.add_middleware(SecurityMiddleware)

    @app.get("/api/v1/me/recommendations")
    def recommendations() -> dict[str, bool]:
        return {"ok": True}

    @app.post("/api/v1/test")
    async def echo(request: Request) -> dict[str, int]:
        return {"length": len(await request.body())}

    return TestClient(app)


def test_expensive_requests_are_limited_without_trusting_spoofed_forwarded_headers() -> None:
    api = client()
    for number in range(12):
        response = api.get(
            "/api/v1/me/recommendations", headers={"X-Forwarded-For": f"192.0.2.{number}"}
        )
        assert response.status_code == 200
        assert response.headers["cache-control"] == "private, no-store"
    blocked = api.get("/api/v1/me/recommendations")
    assert blocked.status_code == 429 and int(blocked.headers["retry-after"]) > 0
    assert blocked.headers["x-content-type-options"] == "nosniff"


def test_body_limit_checks_actual_bytes_and_preserves_normal_request_bodies() -> None:
    api = client()
    assert api.post("/api/v1/test", content=b"abc").json() == {"length": 3}
    response = api.post("/api/v1/test", content=b"x" * (4 * 1024 * 1024 + 1))
    assert response.status_code == 413
    assert response.headers["x-frame-options"] == "DENY"
