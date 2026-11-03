"""Pre-generated BookInfo shelf (Fase 3 of docs/prompt-nexo-catalogo.md).

A daily cron builds the shelf and stores it in public.book_showcase. Requests only read the
latest stored week, so the books tab never waits for BookInfo, Google or Open Library.
Without the secret key (local mode, tests) discovery keeps building the shelf on request.
"""

from __future__ import annotations

import threading
import time
from typing import TYPE_CHECKING

from pydantic import ValidationError

from app.book_selection import BookSelection, BookShelf
from app.observability import log_event

if TYPE_CHECKING:
    from app.search import FederatedSearch

CACHE_SECONDS = 60.0


class Showcase:
    def __init__(self, search: FederatedSearch, selection: BookSelection | None = None) -> None:
        self.search = search
        self.selection = selection or BookSelection(search)
        self.lock = threading.Lock()
        self.cached: tuple[float, BookShelf | None] | None = None

    @property
    def enabled(self) -> bool:
        return self.search.writer.catalog_enabled

    def stored(self) -> BookShelf | None:
        """Read the latest week from Supabase. Raises CatalogUnavailable on failure."""
        payload = self.search.catalog.book_showcase()
        if not isinstance(payload, dict):
            return None
        try:
            shelf = BookShelf.model_validate(payload)
        except ValidationError:
            log_event("showcase_invalid")
            return None
        shelf.info.selected_count = len(shelf.items)
        return shelf

    def current(self) -> BookShelf | None:
        """Latest stored shelf, kept in memory for a minute per instance."""
        now = time.monotonic()
        with self.lock:
            if self.cached and self.cached[0] > now:
                return self.cached[1]
        shelf = self.stored()
        with self.lock:
            self.cached = (now + CACHE_SECONDS, shelf)
        return shelf

    def refresh(self, force: bool = False) -> dict[str, object]:
        """Build and store the shelf if BookInfo has a week we do not have yet."""
        rows, start = self.selection.ranked()
        stored = self.stored()
        if stored and stored.info.period_start == start and not force:
            return {"status": "unchanged", "week": start.isoformat(), "items": len(stored.items)}
        shelf = self.selection.build(rows, start)
        saved = self.search.writer.save_showcase(start.isoformat(), shelf.model_dump(mode="json"))
        with self.lock:
            self.cached = None
        return {
            "status": "generated" if saved else "write_failed",
            "week": start.isoformat(),
            "items": len(shelf.items),
        }
