from pathlib import Path

import pytest

from app.books import isbn13
from app.catalog import Catalog
from app.core.config import Settings
from app.isbn import book_id, book_slug, first_isbn, normalize_isbn
from app.metadata_cache import MetadataCache
from app.search import FederatedSearch

ISBN13 = "9788501117847"


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("978-85-011-1784-7", ISBN13),
        ("ISBN 978 85 011 1784 7", ISBN13),
        ("0-441-17271-7", "9780441172719"),
        ("080442957X", "9780804429573"),
        ("080442957x", "9780804429573"),
        ("9788501117848", None),  # wrong ISBN-13 check digit
        ("0441172718", None),  # wrong ISBN-10 check digit
        ("X804429570", None),  # X only allowed as the last ISBN-10 character
        ("9771234567003", None),  # 977 is not a book prefix
        ("not-an-isbn", None),
        ("", None),
        (9788501117847, None),
        (None, None),
    ],
)
def test_normalize_isbn(value: object, expected: str | None) -> None:
    assert normalize_isbn(value) == expected


def test_old_name_is_the_same_function() -> None:
    assert isbn13 is normalize_isbn


def test_first_isbn_prefers_isbn13_then_falls_back_to_isbn10() -> None:
    assert first_isbn(["0441172717", ISBN13]) == ISBN13
    assert first_isbn(["bad", "0441172717"]) == "9780441172719"
    assert first_isbn(["bad", 123, None]) is None


def test_ids_derive_from_isbn13() -> None:
    assert book_slug(ISBN13) == "book-isbn-" + ISBN13
    assert book_id(ISBN13) == book_id(ISBN13) != book_id("9780441172719")


def search(tmp_path: Path) -> FederatedSearch:
    settings = Settings(_env_file=None, catalog_source="local")
    return FederatedSearch(settings, Catalog(settings), MetadataCache(tmp_path / "public.sqlite3"))


def test_open_library_work_with_isbn_gets_the_shared_book_identity(tmp_path: Path) -> None:
    item = search(tmp_path)._book_item(
        {
            "key": "/works/OL123W",
            "title": "Duna",
            "isbn": ["0441172717", "9780441172719"],
            "editions": {"docs": [{"cover_i": 9, "isbn": ["8576572001", ISBN13]}]},
        }
    )
    assert item.isbn_13 == ISBN13  # the shown edition wins over the work list
    assert item.slug == book_slug(ISBN13) and item.id == book_id(ISBN13)
    assert item.provider == "open_library" and item.external_id == "OL123W"


def test_open_library_work_without_isbn_keeps_its_source_identity(tmp_path: Path) -> None:
    item = search(tmp_path)._book_item({"key": "/works/OL123W", "title": "Duna", "isbn": "bad"})
    assert item.isbn_13 is None
    assert item.slug == "open-library-work-ol123w"


def test_open_library_search_asks_for_isbns() -> None:
    from app.search import BOOK_FIELDS

    assert {"isbn", "editions.isbn"} <= set(BOOK_FIELDS.split(","))
