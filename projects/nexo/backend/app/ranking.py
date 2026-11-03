"""How search results are ordered and how editions of the same book are collapsed.

Catalog rows and source results are ranked by the same rules, so a stored book never
jumps ahead of a better match just because it is already in the catalog.
"""

from __future__ import annotations

import re
from collections.abc import Iterable

from app.catalog import MediaItem, normalize

WORD = re.compile(r"[0-9a-z]+")
# Leading articles do not change what a title is about: "O Príncipe" matches "principe".
ARTICLES = {"o", "a", "os", "as", "um", "uma", "el", "la", "los", "las", "the", "an", "le", "les"}


def words(value: str) -> list[str]:
    return WORD.findall(normalize(value))


def without_article(value: str) -> str:
    parts = words(value)
    if len(parts) > 1 and parts[0] in ARTICLES:
        parts = parts[1:]
    return " ".join(parts)


def relevance(item: MediaItem, query: str) -> int:
    """0 is best: exact title, title prefix, every word in the title, words in title or authors."""
    term = without_article(query)
    if not term:
        return 0
    names = [item.title, item.original_title or "", *item.aliases]
    flat = [without_article(name) for name in names]
    if term in flat:
        return 0
    if any(name.startswith(term) for name in flat):
        return 1
    wanted = term.split()
    title_words = [word for name in flat for word in name.split()]
    if all(any(word.startswith(part) for word in title_words) for part in wanted):
        return 2
    author_words = [word for name in item.creators for word in words(name)]
    if all(any(word.startswith(part) for word in title_words + author_words) for part in wanted):
        return 3
    return 4


def in_portuguese(item: MediaItem) -> bool:
    return (item.language or "").lower().startswith("pt")


def preference(item: MediaItem) -> tuple[int, int]:
    """Within the same relevance: Portuguese books first, then books with a cover.

    Open Library results carry no language, but that search already asks for Portuguese
    editions, so an unknown language sits between Portuguese and any other language.
    """
    if item.media_type != "book":
        return (0, 0)
    language = 0 if in_portuguese(item) else 1 if item.language is None else 2
    return (language, 0 if item.poster_path else 1)


def rank(items: Iterable[MediaItem], query: str) -> list[MediaItem]:
    # sorted() is stable: ties keep the order the sources returned.
    return sorted(items, key=lambda item: (relevance(item, query), *preference(item)))


def edition_key(item: MediaItem) -> str | None:
    """Same normalized title and first author = editions of one book."""
    if item.media_type != "book" or not item.creators:
        return None
    title = " ".join(words(item.title))
    author = " ".join(words(item.creators[0]))
    return f"{title}|{author}" if title and author else None


def edition_quality(item: MediaItem) -> tuple[bool, bool, bool, bool, bool]:
    return (
        item.editorial_note is not None,  # curated by hand
        in_portuguese(item),
        bool(item.poster_path),
        bool(item.description),
        bool(item.isbn_13),
    )


def collapse_editions(items: list[MediaItem]) -> list[MediaItem]:
    """Keep one result per book: the most complete edition, at the first position seen."""
    best: dict[str, MediaItem] = {}
    for item in items:
        key = edition_key(item)
        if key and (key not in best or edition_quality(item) > edition_quality(best[key])):
            best[key] = item
    result: list[MediaItem] = []
    placed: set[str] = set()
    for item in items:
        key = edition_key(item)
        if key is None:
            result.append(item)
        elif key not in placed:
            placed.add(key)
            result.append(best[key])
    return result
