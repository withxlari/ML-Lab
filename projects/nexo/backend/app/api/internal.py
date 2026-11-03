"""Routes called by Vercel Cron, never by browsers. Hidden from the API schema."""

from secrets import compare_digest
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException
from pydantic import ValidationError

from app.catalog import CatalogUnavailable
from app.catalog_writer import CatalogWriter
from app.core.config import Settings
from app.observability import log_event
from app.search import SourceFailure
from app.showcase import Showcase


def create_internal_router(
    settings: Settings, showcase: Showcase, writer: CatalogWriter
) -> APIRouter:
    router = APIRouter(prefix="/api/v1/internal", include_in_schema=False)

    def authorized(header: str | None) -> bool:
        secret = settings.cron_secret
        if secret is None:
            return False
        expected = f"Bearer {secret.get_secret_value()}"
        return compare_digest((header or "").encode(), expected.encode())

    @router.get("/showcase")
    def refresh_showcase(
        authorization: Annotated[str | None, Header()] = None, force: bool = False
    ) -> dict[str, object]:
        if not authorized(authorization):
            raise HTTPException(401, "Não autorizado.")
        if not showcase.enabled:
            raise HTTPException(503, "A vitrine pré-gerada não está configurada.")
        try:
            result = showcase.refresh(force)
        except (
            SourceFailure,
            CatalogUnavailable,
            ValidationError,
            KeyError,
            TypeError,
            ValueError,
        ):
            log_event("showcase_refresh_failed")
            raise HTTPException(503, "Não foi possível gerar a vitrine agora.") from None
        removed = writer.cleanup_lookup_stats(settings.stats_retention_days)
        log_event(
            "showcase_refresh",
            status=str(result["status"]),
            week=str(result["week"]),
            stats_removed=removed if removed is not None else -1,
        )
        if result["status"] == "write_failed":
            raise HTTPException(503, "A vitrine foi montada, mas não foi gravada.")
        return {**result, "stats_removed": removed}

    return router
