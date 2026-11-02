from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.account import AccountStore
from app.api.account import create_account_router
from app.api.community import create_community_router
from app.api.health import router as health_router
from app.api.media import create_media_router
from app.api.search import create_discovery_router, create_search_router
from app.candidates import CandidatePool
from app.catalog import Catalog
from app.core.config import Settings
from app.personalization import PersonalizationService
from app.search import FederatedSearch
from app.security import SecurityMiddleware


def create_app(settings: Settings | None = None) -> FastAPI:
    config = settings if settings is not None else Settings()
    application = FastAPI(
        title="Nexo API",
        version="0.1.0",
        description="Nexo media discovery and private content-based recommendations.",
        docs_url="/docs" if config.environment != "production" else None,
        redoc_url=None,
        openapi_url="/openapi.json" if config.environment != "production" else None,
    )
    application.add_middleware(SecurityMiddleware)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=config.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Content-Type", "Authorization"],
    )
    application.include_router(health_router)
    catalog = Catalog(config)
    application.include_router(create_media_router(catalog))
    search = FederatedSearch(config, catalog)
    account = AccountStore(config, catalog)
    application.include_router(create_search_router(search))
    application.include_router(create_discovery_router(search))
    application.include_router(
        create_account_router(account, PersonalizationService(account, CandidatePool(search)))
    )
    application.include_router(create_community_router(account))
    return application


app = create_app()
