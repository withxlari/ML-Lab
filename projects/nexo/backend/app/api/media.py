from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import Field

from app.catalog import Catalog, CatalogPage, CatalogUnavailable, MediaItem, MediaType

Slug = Annotated[str, Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=100)]


def create_media_router(catalog: Catalog) -> APIRouter:
    router = APIRouter(prefix="/api/v1/media", tags=["catalog"])

    @router.get("", response_model=CatalogPage)
    def list_media(
        media_type: MediaType | None = None,
        q: Annotated[str, Query(max_length=200)] = "",
        limit: Annotated[int, Query(ge=1, le=100)] = 24,
        offset: Annotated[int, Query(ge=0)] = 0,
        slugs: Annotated[list[Slug] | None, Query(max_length=100)] = None,
    ) -> CatalogPage:
        try:
            return catalog.search(media_type, q, limit, offset, slugs)
        except CatalogUnavailable as error:
            raise HTTPException(503, "O catálogo está indisponível. Tente novamente.") from error

    @router.get("/{media_id}", response_model=MediaItem)
    def get_media(media_id: UUID) -> MediaItem:
        try:
            item = catalog.get(media_id)
        except CatalogUnavailable as error:
            raise HTTPException(503, "O catálogo está indisponível. Tente novamente.") from error
        if item is None:
            raise HTTPException(404, "Título não encontrado.")
        return item

    return router
