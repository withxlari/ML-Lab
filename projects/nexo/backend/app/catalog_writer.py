"""The only module that uses NEXO_SUPABASE_SECRET_KEY.

It writes operational data that users must not touch (see docs/prompt-nexo-catalogo.md,
"Escrita no banco"). Without the key every method is a no-op, so the app keeps working
read-only. Failures are logged and swallowed: a write must never break a response.
"""

from __future__ import annotations

import json
from collections.abc import Iterable, Sequence
from dataclasses import asdict
from datetime import UTC, datetime
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request

from app import observability
from app.catalog import MediaItem
from app.core.config import Settings
from app.http_pool import urlopen
from app.observability import LookupStat, log_event

STATS_TIMEOUT = 0.3
MAX_STATS_PER_REQUEST = 100
WRITE_TIMEOUT = 3.0
BOOK_BATCH = 50
BOOK_PROVIDERS = {"google_books", "open_library"}
BOOK_FIELDS = {
    "id",
    "slug",
    "title",
    "original_title",
    "media_type",
    "release_year",
    "poster_path",
    "description",
    "source_url",
    "isbn_13",
    "publisher",
    "edition_date",
    "language",
    "provider",
    "provider_entity_type",
    "external_id",
}
TEXT_LIMITS = {
    "title": 300,
    "original_title": 300,
    "publisher": 300,
    "edition_date": 100,
    "language": 30,
    "description": 5000,
}


def storable_book(item: MediaItem) -> bool:
    return (
        item.media_type == "book"
        and item.provider in BOOK_PROVIDERS
        and bool(item.provider_entity_type)
        and bool(item.external_id)
    )


def book_row(item: MediaItem, fetched_at: str) -> dict[str, Any]:
    """Only the catalog columns, with every text cut to the size the table accepts."""
    row: dict[str, Any] = item.model_dump(mode="json", include=BOOK_FIELDS)
    for field, limit in TEXT_LIMITS.items():
        value = row.get(field)
        if isinstance(value, str):
            row[field] = value[:limit].strip() or None
    row["creators"] = [name[:300].strip() for name in item.creators[:20] if name.strip()]
    row["genres"] = [name[:300].strip() for name in item.genres[:20] if name.strip()]
    row["fetched_at"] = fetched_at
    return row


class CatalogWriter:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    @property
    def enabled(self) -> bool:
        return (
            self.settings.supabase_secret_key is not None and self.settings.supabase_url is not None
        )

    @property
    def catalog_enabled(self) -> bool:
        # Books are only worth storing where the app also reads the Supabase catalog.
        return self.enabled and self.settings.catalog_source == "supabase"

    def _request(self, path: str, body: object, prefer: str | None = None) -> Request:
        assert self.settings.supabase_secret_key is not None
        headers = {
            "apikey": self.settings.supabase_secret_key.get_secret_value(),
            "Content-Type": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        return Request(
            str(self.settings.supabase_url).rstrip("/") + path,
            data=json.dumps(body).encode(),
            headers=headers,
            method="POST",
        )

    def _post(self, path: str, body: object, timeout: float) -> None:
        with urlopen(self._request(path, body, "return=minimal"), timeout=timeout) as response:
            response.read(1024)

    def _rpc(self, function: str, payload: object) -> Any:
        request = self._request("/rest/v1/rpc/" + function, payload)
        with observability.timed("supabase_write"), urlopen(request, WRITE_TIMEOUT) as response:
            raw = response.read(1_000_001)
        return json.loads(raw) if raw else None

    def insert_lookup_stats(self, stats: Sequence[LookupStat]) -> bool:
        if not self.enabled or not stats:
            return False
        rows = [asdict(stat) for stat in stats[:MAX_STATS_PER_REQUEST]]
        try:
            self._post("/rest/v1/lookup_stats", rows, STATS_TIMEOUT)
            return True
        except HTTPError as error:
            log_event("lookup_stats_dropped", reason="http", status=error.code, rows=len(rows))
        except (URLError, TimeoutError, OSError):
            log_event("lookup_stats_dropped", reason="network", rows=len(rows))
        return False

    def upsert_books(self, items: Iterable[MediaItem]) -> list[str | None]:
        """Store books found at runtime. Returns, per stored row, the slug that holds it."""
        if not self.catalog_enabled:
            return []
        fetched_at = datetime.now(UTC).isoformat()
        rows = [book_row(item, fetched_at) for item in items if storable_book(item)]
        saved: list[str | None] = []
        for start in range(0, len(rows), BOOK_BATCH):
            batch = rows[start : start + BOOK_BATCH]
            try:
                result = self._rpc("upsert_runtime_books", {"p_items": batch})
            except HTTPError as error:
                log_event("catalog_write_failed", reason="http", status=error.code, rows=len(batch))
                break
            except (URLError, TimeoutError, OSError, ValueError):
                log_event("catalog_write_failed", reason="network", rows=len(batch))
                break
            if isinstance(result, list):
                saved.extend(slug if isinstance(slug, str) else None for slug in result)
        if rows:
            log_event(
                "catalog_books_stored",
                sent=len(rows),
                stored=sum(1 for slug in saved if slug),
            )
        return saved

    def save_showcase(self, week: str, payload: object) -> bool:
        """Insert or replace the shelf of one BookInfo week."""
        if not self.catalog_enabled:
            return False
        body = {"week": week, "payload": payload, "generated_at": datetime.now(UTC).isoformat()}
        request = self._request(
            "/rest/v1/book_showcase?on_conflict=week",
            body,
            "resolution=merge-duplicates,return=minimal",
        )
        try:
            with observability.timed("supabase_write"), urlopen(request, WRITE_TIMEOUT) as answer:
                answer.read(1024)
            return True
        except HTTPError as error:
            log_event("showcase_write_failed", reason="http", status=error.code)
        except (URLError, TimeoutError, OSError):
            log_event("showcase_write_failed", reason="network")
        return False

    def cleanup_lookup_stats(self, days: int) -> int | None:
        """Delete lookup_stats rows older than `days`. Returns how many, or None on failure."""
        if not self.enabled:
            return None
        try:
            removed = self._rpc("cleanup_lookup_stats", {"p_days": days})
        except HTTPError as error:
            log_event("stats_cleanup_failed", reason="http", status=error.code)
            return None
        except (URLError, TimeoutError, OSError, ValueError):
            log_event("stats_cleanup_failed", reason="network")
            return None
        return removed if isinstance(removed, int) else None

    def claim_enrichment(self, slug: str) -> bool:
        """True only for the one caller allowed to complete this book today."""
        if not self.catalog_enabled:
            return False
        try:
            return self._rpc("claim_enrichment", {"p_slug": slug}) is True
        except HTTPError as error:
            log_event("enrichment_claim_failed", reason="http", status=error.code)
        except (URLError, TimeoutError, OSError, ValueError):
            log_event("enrichment_claim_failed", reason="network")
        return False
