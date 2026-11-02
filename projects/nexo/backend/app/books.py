from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit

from pydantic import ValidationError

from app.catalog import MediaItem
from app.isbn import book_id, book_slug, first_isbn, normalize_isbn
from app.search import NotConfigured, SourceFailure, clean, make_item, year

if TYPE_CHECKING:
    from app.search import FederatedSearch


# Kept for existing imports; app/isbn.py is the single implementation.
isbn13 = normalize_isbn


def cover_url(links: dict[str, Any], volume_id: str) -> str | None:
    for size in ("extraLarge", "large", "medium", "thumbnail", "smallThumbnail"):
        value = links.get(size)
        if not isinstance(value, str):
            continue
        parsed = urlsplit(value)
        params = parse_qs(parsed.query)
        if (
            parsed.hostname not in {"books.google.com", "books.google.com.br"}
            or parsed.path not in {"/books/content", "/books/publisher/content"}
            or params.get("id") != [volume_id]
        ):
            continue
        allowed = {"id", "img", "zoom", "printsec", "edge", "source", "w", "h", "sig", "hl"}
        query = urlencode({key: values[0] for key, values in params.items() if key in allowed})
        return urlunsplit(("https", "books.google.com", parsed.path, query, ""))
    return None


class Books:
    def __init__(self, search: FederatedSearch) -> None:
        self.search = search

    def request(self, path: str, params: dict[str, str | int] | None = None) -> dict[str, Any]:
        key = self.search.settings.google_books_api_key
        if key is None or not key.get_secret_value().strip():
            raise NotConfigured()
        url = "https://www.googleapis.com/books/v1/" + path
        if params:
            url += "?" + urlencode(params)
        result: dict[str, Any] = self.search.http.request(
            url, headers={"X-Goog-Api-Key": key.get_secret_value()}, ttl=7 * 86400
        )
        return result

    def item(self, raw: dict[str, Any]) -> MediaItem:
        external = str(raw["id"])
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", external):
            raise SourceFailure("Invalid book volume identity.")
        info = raw["volumeInfo"]
        identifiers = info.get("industryIdentifiers", [])
        number = first_isbn(entry.get("identifier") for entry in identifiers)
        title = clean(info.get("title"), 500)
        subtitle = clean(info.get("subtitle"), 500)
        item = make_item(
            "google_books",
            "volume",
            external,
            title=title,
            media_type="book",
            release_year=year(info.get("publishedDate")),
            creators=[author for author in info.get("authors", []) if isinstance(author, str)][:20],
            genres=[label for label in info.get("categories", []) if isinstance(label, str)][:20],
            poster_path=cover_url(info.get("imageLinks") or {}, external)
            or (
                f"https://covers.openlibrary.org/b/isbn/{number}-L.jpg?default=false"
                if number
                else None
            ),
            description=clean(info.get("description")),
            source_url="https://books.google.com/books?id=" + external,
            isbn_13=number,
            language=clean(info.get("language"), 30),
            publisher=clean(info.get("publisher"), 500),
            edition_date=clean(info.get("publishedDate"), 100),
            aliases=[subtitle] if subtitle else [],
        )
        if number:
            item = item.model_copy(update={"id": book_id(number), "slug": book_slug(number)})
        return item

    def google(
        self, query: str, page: int, portuguese: bool = True
    ) -> tuple[list[MediaItem], bool]:
        params: dict[str, str | int] = {
            "q": query,
            "maxResults": 8,
            "startIndex": (page - 1) * 8,
            "printType": "books",
            "orderBy": "relevance",
        }
        if portuguese:
            params["langRestrict"] = "pt"
        data = self.request("volumes", params)
        items = []
        for raw in data.get("items", []):
            try:
                item = self.item(raw)
                if portuguese and item.language and item.language not in {"pt", "pt-BR", "pt-PT"}:
                    continue
                items.append(item)
            except (SourceFailure, ValidationError, KeyError, TypeError, ValueError):
                continue
        unique: dict[str, MediaItem] = {}
        for item in items:
            unique.setdefault(item.isbn_13 or str(item.source_url), item)
        return list(unique.values()), page * 8 < data.get("totalItems", 0)

    def find(self, query: str, page: int) -> tuple[list[MediaItem], bool]:
        try:
            items, more = self.google(query, page)
            if not items:
                items, more = self.google(query, page, portuguese=False)
            if items:
                return items, more
        except (SourceFailure, ValidationError, KeyError, TypeError, ValueError):
            pass
        return self.search.open_library_books(query, page)

    def edition(self, number: str, title: str, author: str) -> MediaItem | None:
        number = isbn13(number) or ""
        if not number:
            return None
        try:
            items, _ = self.google("isbn:" + number, 1, portuguese=False)
            exact = next((item for item in items if item.isbn_13 == number), None)
            if exact:
                return exact.model_copy(
                    update={
                        "title": title,
                        "aliases": list(dict.fromkeys([*exact.aliases, exact.title]))[:20],
                    }
                )
        except (SourceFailure, ValidationError, KeyError, TypeError, ValueError):
            pass
        try:
            items, _ = self.search.open_library_books("isbn:" + number, 1)
            if items:
                return items[0].model_copy(
                    update={
                        "id": book_id(number),
                        "slug": book_slug(number),
                        "isbn_13": number,
                        "title": title,
                        "creators": items[0].creators or [author],
                        "language": "pt",
                    }
                )
        except (SourceFailure, ValidationError, KeyError, TypeError, ValueError):
            pass
        return None

    def details(self, external: str) -> MediaItem:
        item = self.item(self.request("volumes/" + external))
        if item.isbn_13 and (not item.description or not item.poster_path):
            try:
                matches, _ = self.search.open_library_books("isbn:" + item.isbn_13, 1)
                if matches:
                    fallback = matches[0]
                    if not fallback.description:
                        fallback = self.search.details(
                            "open_library", "work", fallback.external_id or ""
                        )
                    item = item.model_copy(
                        update={
                            "description": item.description or fallback.description,
                            "poster_path": item.poster_path or fallback.poster_path,
                            "genres": item.genres or fallback.genres,
                        }
                    )
            except (SourceFailure, ValidationError, KeyError, TypeError, ValueError):
                pass
        return item
