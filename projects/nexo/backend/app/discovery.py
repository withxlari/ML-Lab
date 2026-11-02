from concurrent.futures import ThreadPoolExecutor
from itertools import zip_longest
from typing import Any

from pydantic import ValidationError

from app import observability
from app.book_selection import BookSelection, BookSelectionInfo
from app.catalog import CatalogPage, CatalogUnavailable, MediaItem, MediaType
from app.search import GAME_FIELDS, FederatedSearch, NotConfigured, SourceFailure, SourceResult

TYPES: list[MediaType] = ["movie", "series", "book", "manga", "game"]
PROVIDERS = {
    "movie": "tmdb",
    "series": "tmdb",
    "book": "bookinfo",
    "manga": "kitsu",
    "game": "igdb",
}
TTL = 6 * 3600


class DiscoveryPage(CatalogPage):
    sources: list[SourceResult]
    book_selection: BookSelectionInfo | None = None


class Discovery:
    def __init__(self, search: FederatedSearch) -> None:
        self.search = search
        self.books = BookSelection(search)

    def fetch(self, category: MediaType) -> list[MediaItem]:
        search = self.search
        if category in {"movie", "series"}:
            entity = "movie" if category == "movie" else "tv"
            data = search._tmdb(f"trending/{entity}/week", ttl=TTL)
            genres = search._tmdb(f"genre/{entity}/list", ttl=86400)
            names = {g["id"]: g["name"] for g in genres.get("genres", [])}
            return [
                search._tmdb_item(
                    {
                        **row,
                        "genres": [
                            {"name": names[g]} for g in row.get("genre_ids", []) if g in names
                        ],
                    },
                    entity,
                )
                for row in data.get("results", [])
                if not row.get("adult")
            ]
        if category == "book":
            return self.books.get().items
        if category == "manga":
            data = search.http.request(
                "https://kitsu.io/api/edge/trending/manga?limit=20&include=categories",
                headers={"Accept": "application/vnd.api+json"},
                ttl=TTL,
            )
            return [
                search._manga_item(row, data.get("included", []))
                for row in data.get("data", [])
                if row["attributes"].get("subtype") != "novel"
                and row["attributes"].get("ageRating") != "R18"
            ]
        popular = search._igdb(
            "fields game_id,value; sort value desc; limit 20; where popularity_type = 1;",
            endpoint="popularity_primitives",
            ttl=TTL,
        )
        ids = [str(row["game_id"]) for row in popular if isinstance(row.get("game_id"), int)]
        if not ids:
            return []
        rows = search._igdb(
            f"fields {GAME_FIELDS}; where id = ({','.join(ids)}) "
            "& version_parent = null & cover != null; limit 20;",
            ttl=TTL,
        )
        by_id = {str(row["id"]): row for row in rows}
        return [search._game_item(by_id[key]) for key in ids if key in by_id]

    def category(self, category: MediaType) -> tuple[list[MediaItem], SourceResult]:
        key = "discovery:v4:" + category
        stored = self.search.metadata.get(key)
        status: Any = "ok"
        if stored is None:
            try:
                items = self.fetch(category)
                if not items:
                    raise SourceFailure("No discovery results.")
                try:
                    canonical = self.search.catalog.canonical_items(items)
                except CatalogUnavailable:
                    canonical = []
                by_url = {str(item.source_url).rstrip("/"): item for item in canonical}
                items = [
                    (
                        item if item.isbn_13 else by_url.get(str(item.source_url).rstrip("/"), item)
                    ).model_copy(
                        update={
                            "poster_path": item.poster_path,
                            "backdrop_path": item.backdrop_path,
                            "is_adult": item.is_adult,
                            "age_rating": item.age_rating,
                            "isbn_13": item.isbn_13,
                            "language": item.language,
                            "publisher": item.publisher,
                            "edition_date": item.edition_date,
                        }
                    )
                    for item in items
                ]
                self.search.metadata.remember(items)
                stored = [item.model_dump(mode="json") for item in items]
                self.search.metadata.put(key, stored, TTL)
            except (SourceFailure, ValidationError, KeyError, TypeError, ValueError) as error:
                status = "not_configured" if isinstance(error, NotConfigured) else "unavailable"
                stored = self.search.metadata.get(key, stale=True) or []
        result = [MediaItem.model_validate(row) for row in stored]
        return result, SourceResult(
            provider=PROVIDERS[category], status=status, returned=len(result)
        )

    def page(self, media_type: MediaType | None, limit: int, offset: int) -> DiscoveryPage:
        categories = [media_type] if media_type else TYPES
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [observability.submit(executor, self.category, c) for c in categories]
            feeds = [future.result() for future in futures]

        ranked = [item for row in zip_longest(*(feed[0] for feed in feeds)) for item in row if item]
        try:
            local = self.search.catalog.search(media_type, "", 100, 0).items
        except CatalogUnavailable:
            local = []
        unique: dict[str, MediaItem] = {}
        for item in [*ranked, *local]:
            identity = "isbn:" + item.isbn_13 if item.isbn_13 else str(item.source_url).rstrip("/")
            unique.setdefault(identity, item)
        items = list(unique.values())
        book_info = None
        if media_type in {None, "book"}:
            selection = self.search.metadata.get("brazilian-books:v2")
            stale = selection is None
            selection = selection or self.search.metadata.get("brazilian-books:v2", stale=True)
            if selection:
                book_info = BookSelectionInfo.model_validate(selection["info"])
                book_info.stale = book_info.stale or stale
                book_info.selected_count = len(selection["items"])
        return DiscoveryPage(
            items=items[offset : offset + limit],
            total=len(items),
            limit=limit,
            offset=offset,
            sources=[feed[1] for feed in feeds],
            book_selection=book_info,
        )
