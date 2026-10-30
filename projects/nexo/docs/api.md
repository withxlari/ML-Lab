# Current API — Phase 0

The API currently exposes health and generated documentation. No catalog or user endpoints are implemented.

## GET /health

Public liveness endpoint. Expected status: HTTP 200.

    {
      "status": "ok",
      "service": "nexo-api",
      "version": "0.1.0"
    }

The response model is in backend/app/api/health.py. This endpoint does not connect to a database, authenticate a user or load a recommendation model.

## OpenAPI

- GET /openapi.json: machine-readable API specification.
- GET /docs: interactive documentation.
- GET /redoc: alternative generated documentation.

## Frontend diagnostic

During Vite development, /health is proxied to http://127.0.0.1:8000. The /dev/status frontend route displays loading, success, retry and failure behavior. That route is not registered in the production UI.

## Configuration boundary

Backend settings use NEXO_ variables. CORS allows the configured local frontend origins and GET requests. Authentication and mutation headers/methods will be added with the corresponding tested features.

Business endpoints will later use /api/v1. The first proposed learning task is GET /api/v1/media with an explicit Pydantic response schema and a small in-memory dataset. This is a plan, not an existing endpoint.
