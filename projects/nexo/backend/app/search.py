import hashlib
import html
import json
import re
import threading
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from typing import Any, Literal
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen
from uuid import NAMESPACE_URL, uuid5

from pydantic import BaseModel, ValidationError

from app import observability
from app.catalog import Catalog, CatalogUnavailable, MediaItem, MediaType, normalize
from app.content_labels import adult_rating, explicit_game_metadata
from app.core.config import Settings
from app.isbn import book_id, book_slug, first_isbn
from app.metadata_cache import MetadataCache
from app.runtime_paths import CACHE_ROOT

Record = dict[str, Any]
Provider = Literal["tmdb", "open_library", "google_books", "kitsu", "igdb"]
LABELS = {
    "catalog": "Nexo",
    "tmdb": "TMDB",
    "open_library": "Open Library",
    "google_books": "Google Books",
    "kitsu": "Kitsu",
    "igdb": "IGDB",
}
GAME_FIELDS = (
    "id,name,slug,url,summary,first_release_date,cover.image_id,genres.name,platforms.name,"
    "alternative_names.name,involved_companies.developer,involved_companies.company.name,"
    "themes.name,keywords.name,age_ratings.rating_category.rating,"
    "age_ratings.rating_content_descriptions.description,screenshots.image_id"
)
BOOK_FIELDS = (
    "key,title,author_name,cover_i,first_publish_year,isbn,editions,editions.cover_i,editions.isbn"
)


class SourceFailure(Exception):
    pass


class NotConfigured(SourceFailure):
    pass


class SourceResult(BaseModel):
    provider: str
    status: Literal["ok", "unavailable", "not_configured"] = "ok"
    returned: int = 0
    has_more: bool = False


class SearchPage(BaseModel):
    items: list[MediaItem]
    sources: list[SourceResult]
    page: int
    has_more: bool


class ProviderHTTP:
    def __init__(self, persistent: MetadataCache | None = None) -> None:
        self.persistent = persistent
        self.cache: OrderedDict[str, tuple[float, Any]] = OrderedDict()
        self.lock = threading.Lock()
        self.host_locks: dict[str, threading.Lock] = {}
        self.last: dict[str, float] = {}
        self.cooldown: dict[str, float] = {}

    def request(
        self,
        url: str,
        data: bytes | None = None,
        headers: dict[str, str] | None = None,
        ttl: int = 3600,
        cache: bool = True,
    ) -> Any:
        host = urlsplit(url).hostname or ""
        if urlsplit(url).scheme != "https" or host not in {
            "api.themoviedb.org",
            "openlibrary.org",
            "kitsu.io",
            "api.igdb.com",
            "id.twitch.tv",
            "www.googleapis.com",
            "www.bookinfo.com.br",
        }:
            raise SourceFailure("Unsupported metadata host.")

        key = url + "|" + (data.decode() if data and cache else "")
        with self.lock:
            hit = self.cache.get(key) if cache else None
            if hit and hit[0] > time.monotonic():
                self.cache.move_to_end(key)
                return hit[1]
            host_lock = self.host_locks.setdefault(host, threading.Lock())
        if cache and self.persistent:
            with observability.timed("cache"):
                stored = self.persistent.get(key)
            if stored is not None:
                return stored
        if not host_lock.acquire(timeout=5):
            raise SourceFailure("Metadata source is busy.")
        try:
            with self.lock:
                hit = self.cache.get(key) if cache else None
                if hit and hit[0] > time.monotonic():
                    return hit[1]
            if self.cooldown.get(host, 0) > time.monotonic():
                raise SourceFailure("Metadata source is cooling down.")
            interval = 1.1 if host == "openlibrary.org" else 0.3
            time.sleep(max(0, interval - (time.monotonic() - self.last.get(host, 0))))
            self.last[host] = time.monotonic()
            request_headers = {
                "Accept": "application/json",
                "User-Agent": "Nexo/0.1 (educational discovery; https://github.com/withxlari)",
                **(headers or {}),
            }
            started = time.perf_counter()
            ok = False
            result: Any = None
            try:
                with urlopen(
                    Request(url, data=data, headers=request_headers), timeout=5
                ) as response:
                    body = response.read(4_000_001)
                    if len(body) > 4_000_000:
                        raise SourceFailure("Metadata response is too large.")
                    result = json.loads(body)
                ok = True
            except HTTPError as error:
                # A 4xx such as 404 is still an answer; timeouts, 5xx and 429 are not.
                ok = error.code < 500 and error.code != 429
                if error.code == 429:
                    retry = error.headers.get("Retry-After", "30")
                    self.cooldown[host] = time.monotonic() + (
                        min(300, max(1, int(retry))) if retry.isdigit() else 30
                    )
                raise SourceFailure("Metadata source unavailable.") from None
            except (URLError, TimeoutError, OSError, ValueError):
                raise SourceFailure("Could not read metadata source.") from None
            finally:
                observability.record_call(host, ok, result, time.perf_counter() - started)
            if cache:
                if self.persistent:
                    self.persistent.put(key, result, ttl)
                with self.lock:
                    self.cache[key] = (time.monotonic() + ttl, result)
                    self.cache.move_to_end(key)
                    while len(self.cache) > 256:
                        self.cache.popitem(last=False)
            return result
        finally:
            host_lock.release()


def clean(value: object, maximum: int = 20000) -> str | None:
    if not isinstance(value, str):
        return None
    value = html.unescape(re.sub(r"<[^>]*>", " ", value))
    value = re.sub(r"\*\*(.*?)\*\*", r"\1", value, flags=re.DOTALL)
    value = re.sub(r"[ \t]+", " ", value).strip()
    return value[:maximum].strip() or None


def year(value: object) -> int | None:
    if isinstance(value, str) and re.match(r"^[0-9]{4}(?:-|$)", value):
        result = int(value[:4])
        return result if 0 < result < 10000 else None
    return None


def identity(item: MediaItem) -> tuple[str | None, str | None, str]:
    return (item.provider, item.provider_entity_type, item.external_id or item.slug)


def make_item(provider: Provider, entity: str, external_id: str, **values: Any) -> MediaItem:
    stem = "open-library" if provider == "open_library" else provider
    slug = f"{stem}-{entity}-{external_id.lower()}"
    if provider == "google_books":
        slug = "google-books-volume-" + hashlib.sha256(external_id.encode()).hexdigest()[:20]
    return MediaItem(
        id=uuid5(NAMESPACE_URL, f"https://nexo.local/{provider}/{entity}/{external_id}"),
        slug=slug,
        provider=provider,
        provider_entity_type=entity,
        external_id=external_id,
        **values,
    )


class FederatedSearch:
    def __init__(
        self, settings: Settings, catalog: Catalog, cache: MetadataCache | None = None
    ) -> None:
        self.settings = settings
        self.catalog = catalog
        self.metadata = cache or MetadataCache(CACHE_ROOT / "metadata/public.sqlite3")
        self.http = ProviderHTTP(self.metadata)
        self.token: str | None = None
        self.token_expiry = 0.0
        self.token_checked = 0.0
        self.token_lock = threading.Lock()

    def _tmdb(self, path: str, params: Record | None = None, ttl: int = 3600) -> Record:
        token = self.settings.tmdb_read_token
        if not token or not token.get_secret_value().strip():
            raise NotConfigured()
        result: Record = self.http.request(
            "https://api.themoviedb.org/3/"
            + path
            + "?"
            + urlencode({"language": "pt-BR", **(params or {})}),
            headers={"Authorization": f"Bearer {token.get_secret_value()}"},
            ttl=ttl,
        )
        return result

    def _tmdb_item(self, data: Record, entity: str) -> MediaItem:
        people = (
            data.get("created_by", [])
            if entity == "tv"
            else [p for p in data.get("credits", {}).get("crew", []) if p.get("job") == "Director"]
        )
        return make_item(
            "tmdb",
            entity,
            str(data["id"]),
            title=clean(data.get("title") or data.get("name"), 500),
            original_title=clean(data.get("original_title") or data.get("original_name"), 500),
            media_type="movie" if entity == "movie" else "series",
            release_year=year(data.get("release_date") or data.get("first_air_date")),
            creators=[p["name"] for p in people if isinstance(p.get("name"), str)],
            genres=[g["name"] for g in data.get("genres", []) if isinstance(g.get("name"), str)],
            poster_path="https://image.tmdb.org/t/p/w500" + data["poster_path"]
            if data.get("poster_path")
            else None,
            description=clean(data.get("overview")),
            editorial_note=clean(data.get("tagline"), 500),
            backdrop_path="https://image.tmdb.org/t/p/w1280" + data["backdrop_path"]
            if data.get("backdrop_path")
            else None,
            source_url=f"https://www.themoviedb.org/{entity}/{data['id']}",
        )

    def tmdb(
        self, query: str, media_type: MediaType | None, page: int
    ) -> tuple[list[MediaItem], bool]:
        entity = {"movie": "movie", "series": "tv"}.get(media_type or "", "multi")
        data = self._tmdb(
            "search/" + entity, {"query": query, "page": page, "include_adult": "false"}
        )
        items = [
            self._tmdb_item(row, row.get("media_type", entity))
            for row in data.get("results", [])
            if not row.get("adult") and row.get("media_type", entity) in {"movie", "tv"}
        ]
        return items, page < min(500, data.get("total_pages", 1))

    def _book_item(self, doc: Record, work: Record | None = None) -> MediaItem:
        source_id = str(doc["key"]).removeprefix("/works/")
        if not re.fullmatch(r"OL[0-9]+W", source_id):
            raise SourceFailure("Invalid literary work identity.")
        work = work or {}
        description = work.get("description")
        if isinstance(description, dict):
            description = description.get("value")
        editions = doc.get("editions", {}).get("docs", [])
        edition: Record = next((row for row in editions if row.get("cover_i")), {})
        cover = edition.get("cover_i") or doc.get("cover_i")
        chosen = edition or (editions[0] if editions else {})

        def isbns(row: Record) -> list[object]:
            values = row.get("isbn")
            return values if isinstance(values, list) else []

        # Prefer the edition shown (its cover), then any ISBN of the work.
        number = first_isbn([*isbns(chosen), *isbns(doc)])
        item = make_item(
            "open_library",
            "work",
            source_id,
            title=clean(doc.get("title") or work.get("title"), 500),
            media_type="book",
            release_year=year(work.get("first_publish_date")) or doc.get("first_publish_year"),
            creators=doc.get("author_name", []),
            description=clean(description),
            poster_path=f"https://covers.openlibrary.org/b/id/{cover}-L.jpg?default=false"
            if isinstance(cover, int) and cover > 0
            else None,
            source_url=f"https://openlibrary.org/works/{source_id}",
            isbn_13=number,
        )
        if number:
            item = item.model_copy(update={"id": book_id(number), "slug": book_slug(number)})
        return item

    def books(self, query: str, page: int) -> tuple[list[MediaItem], bool]:
        from app.books import Books

        return Books(self).find(query, page)

    def open_library_books(self, query: str, page: int) -> tuple[list[MediaItem], bool]:
        params = urlencode(
            {
                "q": query,
                "lang": "pt",
                "limit": 8,
                "page": page,
                "fields": BOOK_FIELDS,
                "editions.sort": "new",
            }
        )
        data = self.http.request("https://openlibrary.org/search.json?" + params)
        items = [self._book_item(row) for row in data.get("docs", [])]
        return items, page * 8 < data.get("numFound", data.get("num_found", 0))

    def _manga_item(self, row: Record, included: list[Record]) -> MediaItem:
        attributes = row["attributes"]
        titles = attributes.get("titles", {})
        cover = attributes.get("posterImage") or {}
        related = row.get("relationships", {}).get("categories", {}).get("data", [])
        category_ids = {r["id"] for r in related}
        genres = [
            clean(r["attributes"].get("title"), 500)
            for r in included
            if r.get("type") == "categories" and r["id"] in category_ids
        ]
        return make_item(
            "kitsu",
            "manga",
            str(row["id"]),
            title=clean(attributes.get("canonicalTitle") or titles.get("en_jp"), 500),
            original_title=clean(titles.get("ja_jp"), 500),
            media_type="manga",
            release_year=year(attributes.get("startDate")),
            aliases=list(
                dict.fromkeys(
                    t
                    for t in [*titles.values(), *attributes.get("abbreviatedTitles", [])]
                    if isinstance(t, str) and 0 < len(t) <= 500
                )
            ),
            poster_path=cover.get("large") or cover.get("original"),
            genres=[g for g in genres if g],
            description=clean(attributes.get("synopsis")),
            source_url="https://kitsu.app/manga/" + attributes.get("slug", str(row["id"])),
        )

    def manga(self, query: str, page: int) -> tuple[list[MediaItem], bool]:
        params = urlencode(
            {
                **({"filter[text]": query} if query else {"sort": "popularityRank"}),
                "page[limit]": 8,
                "page[offset]": (page - 1) * 8,
                "include": "categories",
            }
        )
        data = self.http.request(
            "https://kitsu.io/api/edge/manga?" + params,
            headers={"Accept": "application/vnd.api+json"},
        )
        items = [
            self._manga_item(row, data.get("included", []))
            for row in data.get("data", [])
            if row["attributes"].get("subtype") != "novel"
            and row["attributes"].get("ageRating") != "R18"
        ]
        return items, bool(data.get("links", {}).get("next"))

    def _igdb(self, body: str, endpoint: str = "games", ttl: int = 3600) -> list[Record]:
        settings = self.settings
        if not settings.igdb_client_id or not settings.igdb_client_secret:
            raise NotConfigured()
        with self.token_lock:
            if not self.token or self.token_expiry <= time.monotonic() + 60:
                response = self.http.request(
                    "https://id.twitch.tv/oauth2/token",
                    data=urlencode(
                        {
                            "client_id": settings.igdb_client_id,
                            "client_secret": settings.igdb_client_secret.get_secret_value(),
                            "grant_type": "client_credentials",
                        }
                    ).encode(),
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                    cache=False,
                )
                self.token = response["access_token"]
                self.token_expiry = time.monotonic() + int(response["expires_in"])
                self.token_checked = 0.0
            if self.token_checked == 0.0 or time.monotonic() - self.token_checked >= 3600:
                try:
                    validation = self.http.request(
                        "https://id.twitch.tv/oauth2/validate",
                        headers={"Authorization": f"OAuth {self.token}"},
                        cache=False,
                    )
                    if validation.get("client_id") != settings.igdb_client_id:
                        raise SourceFailure("Token does not belong to this application.")
                    self.token_checked = time.monotonic()
                except SourceFailure:
                    self.token = None
                    self.token_expiry = 0
                    raise
        result: list[Record] = self.http.request(
            "https://api.igdb.com/v4/" + endpoint,
            data=body.encode(),
            headers={
                "Client-ID": settings.igdb_client_id,
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "text/plain",
            },
            ttl=ttl,
        )
        return result

    def _game_item(self, row: Record) -> MediaItem:
        date = row.get("first_release_date")
        cover = (row.get("cover") or {}).get("image_id")
        ratings = [
            str(r.get("rating_category", {}).get("rating", "")) for r in row.get("age_ratings", [])
        ]
        labels = [
            str(row.get("name", "")),
            *[str(r.get("name", "")) for r in [*row.get("themes", []), *row.get("keywords", [])]],
        ]
        labels.extend(
            str(d.get("description", ""))
            for r in row.get("age_ratings", [])
            for d in r.get("rating_content_descriptions", [])
        )
        mature = adult_rating(ratings) or explicit_game_metadata(labels)
        screenshots = row.get("screenshots", [])
        screenshot = screenshots[0].get("image_id") if screenshots else None
        return make_item(
            "igdb",
            "game",
            str(row["id"]),
            title=clean(row.get("name"), 500),
            media_type="game",
            release_year=datetime.fromtimestamp(date, UTC).year
            if isinstance(date, (int, float))
            else None,
            creators=[
                p["company"]["name"]
                for p in row.get("involved_companies", [])
                if p.get("developer") and p.get("company", {}).get("name")
            ],
            platforms=[p["name"] for p in row.get("platforms", []) if p.get("name")],
            genres=[p["name"] for p in row.get("genres", []) if p.get("name")],
            aliases=[p["name"] for p in row.get("alternative_names", []) if p.get("name")],
            poster_path=f"https://images.igdb.com/igdb/image/upload/t_cover_big/{cover}.jpg"
            if cover
            else None,
            description=clean(row.get("summary")),
            is_adult=mature,
            age_rating="18+" if mature else (clean(", ".join(filter(None, ratings)), 500)),
            backdrop_path=f"https://images.igdb.com/igdb/image/upload/t_screenshot_big/{screenshot}.jpg"
            if screenshot
            else None,
            source_url=row.get("url") or "https://www.igdb.com/games/" + row["slug"],
        )

    def games(self, query: str, page: int) -> tuple[list[MediaItem], bool]:

        search = f"search {json.dumps(query)}; " if query else "sort total_rating_count desc; "
        data = self._igdb(
            f"{search}fields {GAME_FIELDS}; where version_parent = null; "
            f"limit 8; offset {(page - 1) * 8};"
        )
        return [self._game_item(row) for row in data], len(data) == 8

    def search(self, query: str, media_type: MediaType | None, page: int) -> SearchPage:
        tasks: dict[str, Any] = {}
        if media_type in {None, "movie", "series"}:
            tasks["tmdb"] = lambda: self.tmdb(query, media_type, page)
        if media_type in {None, "book"}:
            tasks["books"] = lambda: self.books(query, page)
        if media_type in {None, "manga"}:
            tasks["kitsu"] = lambda: self.manga(query, page)
        if media_type in {None, "game"}:
            tasks["igdb"] = lambda: self.games(query, page)
        sources: list[SourceResult] = []
        collected: list[MediaItem] = []

        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = {
                provider: observability.submit(executor, task) for provider, task in tasks.items()
            }
            for provider, future in futures.items():
                try:
                    items, more = future.result()
                    if provider == "books":
                        provider = (
                            (items[0].provider or "open_library")
                            if items
                            else (
                                "google_books"
                                if self.settings.google_books_api_key
                                else "open_library"
                            )
                        )
                    collected.extend(items)
                    sources.append(
                        SourceResult(provider=provider, returned=len(items), has_more=more)
                    )
                except NotConfigured:
                    sources.append(SourceResult(provider=provider, status="not_configured"))
                except (SourceFailure, ValidationError, KeyError, TypeError, ValueError):
                    sources.append(SourceResult(provider=provider, status="unavailable"))
        try:
            local = self.catalog.search(media_type, query, 12, (page - 1) * 12)
            canonical = self.catalog.canonical_items(collected)
            sources.insert(
                0,
                SourceResult(
                    provider="catalog",
                    returned=len(local.items),
                    has_more=local.offset + len(local.items) < local.total,
                ),
            )
            items_by_key = {identity(item): item for item in canonical}
            collected = [
                items_by_key.get(identity(item), item).model_copy(
                    update={
                        "poster_path": item.poster_path
                        or items_by_key.get(identity(item), item).poster_path,
                        "backdrop_path": item.backdrop_path,
                        "is_adult": item.is_adult
                        or items_by_key.get(identity(item), item).is_adult,
                        "age_rating": item.age_rating,
                    }
                )
                for item in collected
            ]
            fresh = {identity(item): item for item in collected}
            collected = [*[fresh.get(identity(item), item) for item in local.items], *collected]
        except CatalogUnavailable:
            sources.insert(0, SourceResult(provider="catalog", status="unavailable"))
        unique: dict[tuple[str | None, str | None, str], MediaItem] = {}
        for item in collected:
            unique.setdefault(identity(item), item)

        term = normalize(query.strip())
        ordered = sorted(
            unique.values(),
            key=lambda item: (
                0
                if any(
                    normalize(t) == term
                    for t in [item.title, item.original_title or "", *item.aliases]
                )
                else 1
                if normalize(item.title).startswith(term)
                else 2
            ),
        )
        self.metadata.remember(ordered)
        return SearchPage(
            items=ordered,
            sources=sources,
            page=page,
            has_more=page < 100 and any(source.has_more for source in sources),
        )

    def details(self, provider: Provider, entity: str, external_id: str) -> MediaItem:
        if (
            provider == "google_books"
            and entity == "volume"
            and re.fullmatch(r"[A-Za-z0-9_-]{1,80}", external_id)
        ):
            from app.books import Books

            item = Books(self).details(external_id)
        elif provider == "tmdb" and entity in {"movie", "tv"} and external_id.isdigit():
            item = self._tmdb_item(
                self._tmdb(
                    f"{entity}/{external_id}", {"append_to_response": "credits"}, ttl=604800
                ),
                entity,
            )
        elif (
            provider == "open_library"
            and entity == "work"
            and re.fullmatch(r"OL[0-9]+W", external_id)
        ):
            work = self.http.request(
                f"https://openlibrary.org/works/{external_id}.json", ttl=604800
            )
            params = urlencode(
                {
                    "q": f"key:/works/{external_id}",
                    "limit": 1,
                    "lang": "pt",
                    "fields": BOOK_FIELDS,
                    "editions.sort": "new",
                }
            )
            docs = self.http.request("https://openlibrary.org/search.json?" + params).get(
                "docs", []
            )
            item = self._book_item(docs[0] if docs else {"key": external_id}, work)
        elif provider == "kitsu" and entity == "manga" and external_id.isdigit():
            data = self.http.request(
                f"https://kitsu.io/api/edge/manga/{external_id}?include=categories",
                headers={"Accept": "application/vnd.api+json"},
            )
            item = self._manga_item(data["data"], data.get("included", []))
        elif provider == "igdb" and entity == "game" and external_id.isdigit():
            data = self._igdb(f"fields {GAME_FIELDS}; where id={external_id}; limit 1;")
            if not data:
                raise SourceFailure("Work not found.")
            item = self._game_item(data[0])
        else:
            raise ValueError("Unsupported provider identity.")
        try:
            canonical = self.catalog.canonical_items([item])
        except CatalogUnavailable:
            canonical = []
        if canonical:
            stored = canonical[0]
            item = stored.model_copy(
                update={
                    "description": stored.description or item.description,
                    "creators": stored.creators or item.creators,
                    "genres": stored.genres or item.genres,
                    "platforms": stored.platforms or item.platforms,
                    "aliases": stored.aliases or item.aliases,
                    "poster_path": item.poster_path or stored.poster_path,
                    "backdrop_path": item.backdrop_path or stored.backdrop_path,
                    "is_adult": item.is_adult or stored.is_adult,
                    "age_rating": item.age_rating or stored.age_rating,
                    "isbn_13": item.isbn_13 or stored.isbn_13,
                    "language": item.language or stored.language,
                    "publisher": item.publisher or stored.publisher,
                    "edition_date": item.edition_date or stored.edition_date,
                }
            )
        self.metadata.remember([item])
        return item
