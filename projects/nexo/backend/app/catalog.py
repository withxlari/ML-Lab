import json
import re
import unicodedata
from pathlib import Path
from typing import Annotated, Literal
from urllib.error import URLError
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    TypeAdapter,
    field_validator,
    model_validator,
)

from app import observability
from app.content_labels import adult_rating, explicit_game_metadata
from app.core.config import Settings
from app.http_pool import urlopen

MediaType = Literal["movie", "series", "book", "manga", "game"]
ShortText = Annotated[str, Field(min_length=1, max_length=500)]


class MediaItem(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    id: UUID
    slug: Annotated[str, Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=100)]
    title: ShortText
    original_title: ShortText | None = None
    media_type: MediaType
    release_year: Annotated[int, Field(strict=True, ge=-9999, le=9999)] | None = None
    creators: list[ShortText] = Field(default_factory=list)
    genres: list[ShortText] = Field(default_factory=list)
    poster_path: str | None = None
    backdrop_path: str | None = None
    is_adult: bool = False
    age_rating: ShortText | None = None
    isbn_13: Annotated[str, Field(pattern=r"^[0-9]{13}$")] | None = None
    language: ShortText | None = None
    publisher: ShortText | None = None
    edition_date: ShortText | None = None
    description: Annotated[str, Field(min_length=1, max_length=20000)] | None = None
    editorial_note: ShortText | None = None
    source_url: HttpUrl
    provider: Literal["tmdb", "open_library", "google_books", "kitsu", "igdb"] | None = None
    provider_entity_type: str | None = None
    external_id: str | None = None
    platforms: list[ShortText] = Field(default_factory=list)
    aliases: list[ShortText] = Field(default_factory=list)

    @field_validator("release_year")
    @classmethod
    def reject_year_zero(cls, value: int | None) -> int | None:
        if value == 0:
            raise ValueError("There is no year zero.")
        return value

    @model_validator(mode="after")
    def warn_for_explicit_legacy_games(self) -> "MediaItem":
        if self.media_type == "game" and (
            explicit_game_metadata([self.title, *self.genres])
            or adult_rating([self.age_rating or ""])
        ):
            self.is_adult = True
        return self

    @field_validator("source_url")
    @classmethod
    def require_https(cls, value: HttpUrl) -> HttpUrl:
        if value.scheme != "https" or len(str(value)) > 2048:
            raise ValueError("Source URLs must use HTTPS and be at most 2048 characters.")
        return value

    @field_validator("poster_path")
    @classmethod
    def require_approved_poster(cls, value: str | None) -> str | None:
        if value and value.startswith("https://books.google.com/"):
            parsed = urlsplit(value)
            params = parse_qs(parsed.query)
            allowed = {"id", "img", "zoom", "printsec", "edge", "source", "w", "h", "sig", "hl"}
            if (
                parsed.path in {"/books/content", "/books/publisher/content"}
                and set(params) <= allowed
                and re.fullmatch(r"[A-Za-z0-9_-]{1,80}", params.get("id", [""])[0])
                and ".." not in value
            ):
                return value
            raise ValueError("Invalid Google Books cover URL.")
        if value is not None and (
            ".." in value
            or not re.fullmatch(
                r"/images/[a-z0-9._-]+|https://image\.tmdb\.org/t/p/w500/[A-Za-z0-9._-]+"
                r"|https://covers\.openlibrary\.org/b/id/[0-9]+-L\.jpg\?default=false"
                r"|https://covers\.openlibrary\.org/b/isbn/[0-9]{13}-L\.jpg\?default=false"
                r"|https://bookinfo-imagens-prod\.s3\.amazonaws\.com/[0-9]{13}-180x240\.jpg"
                r"|https://media\.kitsu\.(?:app|io)/manga/[A-Za-z0-9/_.-]+"
                r"|https://images\.igdb\.com/igdb/image/upload/t_cover_big/[A-Za-z0-9_-]+\.jpg",
                value,
            )
        ):
            raise ValueError("Poster must use a local asset or an approved provider image.")
        return value

    @field_validator("backdrop_path")
    @classmethod
    def require_approved_backdrop(cls, value: str | None) -> str | None:
        if value is not None and not re.fullmatch(
            r"https://image\.tmdb\.org/t/p/w1280/[A-Za-z0-9_-]+\.[A-Za-z0-9]+"
            r"|https://images\.igdb\.com/igdb/image/upload/t_screenshot_big/[A-Za-z0-9_-]+\.jpg",
            value,
        ):
            raise ValueError("Backdrop must use the approved provider image host.")
        return value


SUPABASE_STAGES = {
    "search_catalog": "supabase_search",
    "resolve_catalog_identities": "supabase_resolve",
    "get_book_showcase": "supabase_showcase",
}


class CatalogPage(BaseModel):
    items: list[MediaItem]
    total: int
    limit: int
    offset: int


class CatalogUnavailable(Exception):
    pass


def normalize(value: str) -> str:
    return "".join(
        char for char in unicodedata.normalize("NFD", value) if not unicodedata.combining(char)
    ).casefold()


class Catalog:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def items(self) -> list[MediaItem]:

        path = Path(__file__).parent / "data" / "catalog.json"
        return TypeAdapter(list[MediaItem]).validate_json(path.read_text(encoding="utf-8"))

    def _rpc(self, function: str, payload: dict[str, object]) -> bytes:
        """Call a public catalog function with the publishable key; raw JSON body."""
        base = str(self.settings.supabase_url).rstrip("/")
        assert self.settings.supabase_publishable_key is not None
        request = Request(
            f"{base}/rest/v1/rpc/{function}",
            data=json.dumps(payload).encode(),
            headers={
                "apikey": self.settings.supabase_publishable_key.get_secret_value(),
                "Content-Type": "application/json",
            },
        )
        try:
            stage = SUPABASE_STAGES.get(function, "supabase_" + function)
            with observability.timed(stage), urlopen(request, timeout=8) as response:
                body: bytes = response.read(4_000_001)
        except (URLError, TimeoutError, OSError) as error:
            raise CatalogUnavailable("Supabase catalog is unavailable.") from error
        if len(body) > 4_000_000:
            raise CatalogUnavailable("Catalog page is too large.")
        return body

    def _remote(self, payload: dict[str, object], function: str = "search_catalog") -> CatalogPage:
        body = self._rpc(function, payload)
        try:
            return CatalogPage.model_validate_json(body)
        except ValueError as error:
            raise CatalogUnavailable("Supabase catalog is unavailable.") from error

    def book_showcase(self) -> object | None:
        """The latest stored BookInfo shelf payload (Supabase mode only)."""
        if self.settings.catalog_source != "supabase":
            return None
        try:
            payload: object = json.loads(self._rpc("get_book_showcase", {}))
        except ValueError as error:
            raise CatalogUnavailable("Supabase catalog is unavailable.") from error
        return payload

    def search(
        self,
        media_type: MediaType | None,
        q: str,
        limit: int,
        offset: int,
        slugs: list[str] | None = None,
    ) -> CatalogPage:
        if self.settings.catalog_source == "supabase":
            return self._remote(
                {
                    "p_media_type": media_type,
                    "p_query": q,
                    "p_limit": limit,
                    "p_offset": offset,
                    "p_slugs": slugs,
                }
            )
        term = normalize(q.strip())
        matches = [
            item
            for item in self.items()
            if (media_type is None or item.media_type == media_type)
            and (slugs is None or item.slug in slugs)
            and term
            in normalize(
                " ".join([item.title, item.original_title or "", *item.creators, *item.genres])
            )
        ]
        return CatalogPage(
            items=matches[offset : offset + limit], total=len(matches), limit=limit, offset=offset
        )

    def get(self, media_id: UUID) -> MediaItem | None:
        if self.settings.catalog_source == "supabase":
            page = self._remote({"p_id": str(media_id), "p_limit": 1})
            return page.items[0] if page.items else None
        return next((item for item in self.items() if item.id == media_id), None)

    def resolve_identity(self, provider: str, entity: str, external_id: str) -> MediaItem | None:
        """The stored catalog row for one source identity, if any (Supabase mode only)."""
        if self.settings.catalog_source != "supabase":
            return None
        keys = [{"provider": provider, "entity": entity, "external_id": external_id}]
        items = self._remote({"p_keys": keys}, "resolve_catalog_identities").items
        return items[0] if items else None

    def canonical_items(self, items: list[MediaItem]) -> list[MediaItem]:
        if self.settings.catalog_source != "supabase" or not items:
            return []
        keys = [
            {
                "provider": item.provider,
                "entity": item.provider_entity_type,
                "external_id": item.external_id,
            }
            for item in items
            if item.provider
        ]
        return self._remote({"p_keys": keys}, "resolve_catalog_identities").items
