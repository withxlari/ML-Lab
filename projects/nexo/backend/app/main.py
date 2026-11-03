from fastapi import FastAPI, Request
from fastapi.exception_handlers import http_exception_handler
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from starlette.exceptions import HTTPException as StarletteHTTPException

from app import observability
from app.account import AccountStore
from app.api.account import create_account_router
from app.api.community import create_community_router
from app.api.health import router as health_router
from app.api.internal import create_internal_router
from app.api.media import create_media_router
from app.api.search import create_discovery_router, create_search_router
from app.candidates import CandidatePool
from app.catalog import Catalog
from app.catalog_writer import CatalogWriter
from app.core.config import Settings
from app.personalization import PersonalizationService
from app.request_context import RequestContextMiddleware
from app.search import FederatedSearch
from app.security import SecurityMiddleware
from app.showcase import Showcase


async def server_error_with_request_id(request: Request, error: StarletteHTTPException) -> Response:
    if error.status_code < 500:
        return await http_exception_handler(request, error)
    return JSONResponse(
        {"detail": error.detail, "request_id": observability.request_id()},
        status_code=error.status_code,
        headers=error.headers,
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    config = settings if settings is not None else Settings()
    observability.configure_logging()
    application = FastAPI(
        title="Nexo API",
        version="0.1.0",
        description="Nexo media discovery and private content-based recommendations.",
        docs_url="/docs" if config.environment != "production" else None,
        redoc_url=None,
        openapi_url="/openapi.json" if config.environment != "production" else None,
    )
    application.add_exception_handler(StarletteHTTPException, server_error_with_request_id)  # type: ignore[arg-type]
    application.add_middleware(SecurityMiddleware)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=config.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Content-Type", "Authorization"],
        expose_headers=["X-Request-Id", "Server-Timing"],
    )
    writer = CatalogWriter(config)
    # Added last, so it is the outermost layer: rate-limit and CORS responses also get an id.
    application.add_middleware(RequestContextMiddleware, writer=writer, origins=config.cors_origins)
    application.include_router(health_router)
    catalog = Catalog(config)
    application.include_router(create_media_router(catalog))
    search = FederatedSearch(config, catalog, writer=writer)
    showcase = Showcase(search)
    account = AccountStore(config, catalog)
    application.include_router(create_search_router(search))
    application.include_router(create_discovery_router(search, showcase))
    application.include_router(create_internal_router(config, showcase, writer))
    application.include_router(
        create_account_router(account, PersonalizationService(account, CandidatePool(search)))
    )
    application.include_router(create_community_router(account))
    return application


app = create_app()
