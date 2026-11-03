from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, HTTPException, Path, Query
from pydantic import ValidationError

from app.catalog import MediaItem, MediaType
from app.discovery import Discovery, DiscoveryPage
from app.search import FederatedSearch, Provider, SearchPage, SourceFailure


def create_search_router(search: FederatedSearch) -> APIRouter:
    router = APIRouter(prefix="/api/v1/search", tags=["discovery"])

    @router.get("", response_model=SearchPage)
    def search_media(
        background: BackgroundTasks,
        q: Annotated[str, Query(max_length=200)] = "",
        media_type: MediaType | None = None,
        page: Annotated[int, Query(ge=1, le=100)] = 1,
    ) -> SearchPage:
        if len(q.strip()) < 2 and not (not q.strip() and media_type in {"manga", "game"}):
            raise HTTPException(422, "Digite pelo menos dois caracteres.")
        result = search.search(q.strip(), media_type, page)
        # Books found here go to the catalog after the response is sent.
        background.add_task(search.store_search_results, q, result.items)
        return result

    @router.get("/details/{provider}/{entity}/{external_id}", response_model=MediaItem)
    def details(
        background: BackgroundTasks,
        provider: Provider,
        entity: str,
        external_id: Annotated[str, Path(pattern=r"^[A-Za-z0-9_-]+$", max_length=80)],
    ) -> MediaItem:
        try:
            item, from_catalog = search.lookup(provider, entity, external_id)
        except (SourceFailure, ValidationError, KeyError, TypeError) as error:
            raise HTTPException(
                503, "Não foi possível abrir todos os detalhes. Tente novamente."
            ) from error
        except ValueError as error:
            raise HTTPException(422, "Identificador de obra inválido.") from error
        if from_catalog:
            background.add_task(search.enrich, item)
        else:
            background.add_task(search.store_books, [item])
        return item

    return router


def create_discovery_router(search: FederatedSearch) -> APIRouter:
    router = APIRouter(prefix="/api/v1/discover", tags=["discovery"])
    discovery = Discovery(search)

    @router.get("", response_model=DiscoveryPage)
    def discover(
        media_type: MediaType | None = None,
        limit: Annotated[int, Query(ge=1, le=100)] = 24,
        offset: Annotated[int, Query(ge=0, le=5000)] = 0,
    ) -> DiscoveryPage:
        return discovery.page(media_type, limit, offset)

    return router
