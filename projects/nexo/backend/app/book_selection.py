from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta
from itertools import zip_longest
from typing import TYPE_CHECKING, Any
from urllib.parse import urlencode

from pydantic import BaseModel, HttpUrl, ValidationError

from app import observability
from app.books import Books, isbn13
from app.catalog import CatalogUnavailable, MediaItem
from app.isbn import book_id, book_slug
from app.search import SourceFailure, clean, year

if TYPE_CHECKING:
    from app.search import FederatedSearch

SOURCE = "https://www.bookinfo.com.br/maisvendidos"
TTL = 86400


class BookSelectionInfo(BaseModel):
    source: str = "BookInfo"
    source_url: str = SOURCE
    period_start: date
    period_end: date
    checked_at: datetime
    stale: bool = False
    selected_count: int = 0
    description: str = "Seleção de ficção, infantojuvenil e não ficção; não é o ranking geral."


class BookShelf(BaseModel):
    items: list[MediaItem]
    info: BookSelectionInfo


class BookSelection:
    def __init__(self, search: FederatedSearch) -> None:
        self.search = search
        self.books = Books(search)

    def request(
        self,
        path: str,
        params: dict[str, str | int] | None = None,
        body: dict[str, Any] | None = None,
    ) -> Any:
        url = "https://www.bookinfo.com.br" + path
        if params:
            url += "?" + urlencode(params)
        return self.search.http.request(
            url,
            data=json.dumps(body).encode() if body else None,
            headers={"Content-Type": "application/json"},
            ttl=TTL,
        )

    def ranked(self) -> tuple[list[dict[str, Any]], date]:
        today = date.today()
        months = self.request("/api/bi/filtro/mes", {"ano": today.year})
        if not months:
            months = self.request("/api/bi/filtro/mes", {"ano": today.year - 1})
        for month in months[:2]:
            label = str(month["mes"])
            periods = self.request("/api/bi/filtro/semana", {"mes": label})
            for period in periods[:2]:
                start = date.fromisoformat(str(period["data_inicio_semana"])[:10])
                if start > today:
                    continue
                groups = []

                for category, count in (("2", 6), ("4", 4), ("3", 2)):
                    rows = self.request(
                        "/api/bi/sintetico-premium",
                        {
                            "agrupamento": "livro",
                            "ano": start.year,
                            "mes": label,
                            "data_inicio_semana": start.isoformat(),
                            "id_categoria": category,
                        },
                    )
                    if not isinstance(rows, list):
                        raise SourceFailure("Invalid public book list.")
                    groups.append([row for row in rows if isbn13(row.get("sku"))][:count])
                chosen: dict[str, dict[str, Any]] = {}
                for row in zip_longest(*groups):
                    for entry in row:
                        if entry:
                            chosen.setdefault(entry["sku"], entry)
                if chosen:
                    return list(chosen.values()), start
        raise SourceFailure("The public book list has no available period.")

    def known_editions(self, numbers: list[str]) -> dict[str, MediaItem]:
        """Books of the shelf already in the catalog, found in a single call by slug."""
        try:
            page = self.search.catalog.search(
                "book", "", 100, 0, [book_slug(number) for number in numbers]
            )
        except CatalogUnavailable:
            return {}
        return {item.isbn_13: item for item in page.items if item.isbn_13}

    def build(self, rows: list[dict[str, Any]], start: date) -> BookShelf:
        """Resolve the ranked BookInfo rows into catalog-quality items."""
        try:
            details = self.request(
                "/api/metadados/livros", body={"skus": [row["sku"] for row in rows]}
            )
        except SourceFailure:
            details = []
        by_isbn = {row["sku"]: row for row in details} if isinstance(details, list) else {}
        known = self.known_editions([str(row["sku"]) for row in rows])

        def resolve(row: dict[str, Any]) -> MediaItem:
            number = str(row["sku"])
            title = clean(row.get("titulo"), 500) or "Livro"
            author = clean(row.get("autor"), 500) or ""
            # Books seen before come from the catalog; only new ones go to Google/Open Library.
            item = known.get(number) or self.books.edition(number, title, author)
            extra = by_isbn.get(number, {})
            ranked_cover = f"https://bookinfo-imagens-prod.s3.amazonaws.com/{number}-180x240.jpg"
            if item:
                return item.model_copy(
                    update={
                        "id": book_id(number),
                        "slug": book_slug(number),
                        "publisher": clean(row.get("editora"), 500) or item.publisher,
                        "description": clean(extra.get("sinopse")) or item.description,
                        "poster_path": item.poster_path
                        if item.poster_path
                        and item.poster_path.startswith("https://books.google.com/")
                        else ranked_cover,
                        "edition_date": clean(str(extra.get("ano_edicao", "")), 100)
                        or item.edition_date,
                        "release_year": year(str(extra.get("ano_edicao", ""))) or item.release_year,
                    }
                )

            return MediaItem(
                id=book_id(number),
                slug=book_slug(number),
                title=title,
                media_type="book",
                isbn_13=number,
                language="pt",
                creators=[author] if author else [],
                publisher=clean(row.get("editora"), 500),
                release_year=year(str(extra.get("ano_edicao", ""))),
                edition_date=clean(str(extra.get("ano_edicao", "")), 100),
                description=clean(extra.get("sinopse")),
                poster_path=ranked_cover,
                source_url=HttpUrl("https://www.bookinfo.com.br/livro/" + number),
            )

        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = [observability.submit(executor, resolve, row) for row in rows]
            items = [future.result() for future in futures]
        self.search.metadata.remember(items)
        self.search.store_books(items)  # editions only known to BookInfo are skipped
        return BookShelf(
            items=items,
            info=BookSelectionInfo(
                period_start=start,
                period_end=start + timedelta(days=6),
                checked_at=datetime.now(UTC),
                selected_count=len(items),
            ),
        )

    def get(self) -> BookShelf:
        """Shelf built on request, cached per instance (local mode, or without the secret key)."""
        key = "brazilian-books:v2"
        stored = self.search.metadata.get(key)
        if stored:
            shelf = BookShelf.model_validate(stored)
            shelf.info.selected_count = len(shelf.items)
            return shelf
        try:
            rows, start = self.ranked()
            shelf = self.build(rows, start)
            self.search.metadata.put(key, shelf.model_dump(mode="json"), TTL)
            return shelf
        except (SourceFailure, ValidationError, KeyError, TypeError, ValueError):
            stored = self.search.metadata.get(key, stale=True)
            if not stored:
                raise SourceFailure("Brazilian book selection unavailable.") from None
            shelf = BookShelf.model_validate(stored)
            shelf.info.stale = True
            shelf.info.selected_count = len(shelf.items)
            return shelf
