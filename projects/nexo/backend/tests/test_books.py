from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

import pytest

from app.account import AccountStore
from app.book_selection import BookSelection, BookSelectionInfo, BookShelf
from app.books import Books, isbn13
from app.candidates import media_identity
from app.catalog import Catalog
from app.core.config import Settings
from app.data_quality import prepare_item
from app.discovery import Discovery
from app.metadata_cache import MetadataCache
from app.search import FederatedSearch, SourceFailure

ISBN = "9788501117847"


@pytest.fixture
def books(tmp_path: Path) -> Books:
    settings = Settings(
        _env_file=None, catalog_source="local", google_books_api_key="SECRET_SENTINEL"
    )
    return Books(
        FederatedSearch(settings, Catalog(settings), MetadataCache(tmp_path / "public.sqlite3"))
    )


def volume(number: str = ISBN, identity: str = "AbCd_12-x") -> dict[str, Any]:
    return {
        "id": identity,
        "volumeInfo": {
            "title": "Verity",
            "authors": ["Colleen Hoover"],
            "language": "pt",
            "publishedDate": "2022-04-01",
            "publisher": "Galera",
            "industryIdentifiers": [{"type": "ISBN_13", "identifier": number}],
            "imageLinks": {
                "thumbnail": f"http://books.google.com/books/content?id={identity}&zoom=1&key=LEAK"
            },
        },
    }


def test_isbn_checksums_and_conversion() -> None:
    assert isbn13("978-85-011-1784-7") == ISBN
    assert isbn13("0-441-17271-7") == "9780441172719"
    assert isbn13("9788501117848") is None
    assert isbn13("not-an-isbn") is None


def test_google_editions_have_stable_isbn_identity_and_no_credentials_in_cover(
    books: Books,
) -> None:
    first = books.item(volume())
    second = books.item(volume(identity="AnotherVolume"))
    assert first.id == second.id
    assert first.slug == "book-isbn-" + ISBN
    assert first.isbn_13 == ISBN and first.language == "pt"
    assert first.publisher == "Galera" and first.release_year == 2022
    assert str(first.poster_path).startswith("https://books.google.com/")
    assert "key=" not in str(first.poster_path)
    a, b = volume(identity="ABC"), volume(identity="abc")
    a["volumeInfo"]["industryIdentifiers"] = []
    b["volumeInfo"]["industryIdentifiers"] = []
    assert books.item(a).id != books.item(b).id
    assert media_identity(books.item(a)) != media_identity(books.item(b))
    assert prepare_item(first).valid
    assert prepare_item(first).identity_key == "google_books:volume:AbCd_12-x"


def test_saving_an_edition_does_not_replace_it_with_an_older_catalog_work(books: Books) -> None:
    edition = books.item(volume())
    old_work = edition.model_copy(update={"slug": "old-work", "isbn_13": None})
    store = AccountStore(books.search.settings, books.search.catalog)
    with patch.object(books.search.catalog, "canonical_items", return_value=[old_work]):
        saved = store.validate_item(edition.model_dump(mode="json"))
    assert saved.slug == edition.slug and saved.isbn_13 == ISBN


def test_google_prioritizes_portuguese_and_keeps_key_only_in_header(books: Books) -> None:
    with (
        patch.object(books.search.http, "request", return_value={"items": [volume()]}) as request,
        patch.object(books.search, "open_library_books") as fallback,
    ):
        items, _ = books.find("Verity", 2)
    assert len(items) == 1
    url = request.call_args.args[0]
    params = parse_qs(urlsplit(url).query)
    assert params["langRestrict"] == ["pt"] and params["startIndex"] == ["8"]
    assert "SECRET_SENTINEL" not in url
    assert request.call_args.kwargs["headers"] == {"X-Goog-Api-Key": "SECRET_SENTINEL"}
    fallback.assert_not_called()


@pytest.mark.parametrize("failure", [True, False])
def test_open_library_is_used_when_google_fails_or_has_no_result(
    books: Books, failure: bool
) -> None:
    with (
        patch.object(
            books, "request", side_effect=SourceFailure() if failure else None, return_value={}
        ),
        patch.object(books.search, "open_library_books", return_value=([], False)) as fallback,
    ):
        assert books.find("Título brasileiro", 1) == ([], False)
    fallback.assert_called_once_with("Título brasileiro", 1)


def test_edition_does_not_accept_a_different_isbn(books: Books) -> None:
    with (
        patch.object(books, "request", return_value={"items": [volume("9780441172719")]}),
        patch.object(books.search, "open_library_books", return_value=([], False)),
    ):
        assert books.edition(ISBN, "Verity", "Colleen Hoover") is None


def test_brazilian_selection_keeps_verified_new_titles_missing_from_both_indexes(
    books: Books,
) -> None:
    selection = BookSelection(books.search)
    row = {"sku": ISBN, "titulo": "Verity", "autor": "Colleen Hoover", "editora": "Galera"}
    with (
        patch.object(selection, "ranked", return_value=([row], date(2026, 10, 19))),
        patch.object(selection.books, "edition", return_value=None),
        patch.object(
            selection,
            "request",
            return_value=[{"sku": ISBN, "sinopse": "Uma edição brasileira.", "ano_edicao": "2022"}],
        ),
    ):
        result = selection.get()
    assert result.info.period_end == date(2026, 10, 25)
    assert result.info.selected_count == 1 and not result.info.stale
    item = result.items[0]
    assert item.id == books.item(volume()).id
    assert item.isbn_13 == ISBN and item.provider is None
    assert item.poster_path == f"https://bookinfo-imagens-prod.s3.amazonaws.com/{ISBN}-180x240.jpg"
    assert str(item.source_url) == "https://www.bookinfo.com.br/livro/" + ISBN
    assert item.language == "pt" and item.release_year == 2022
    with patch.object(selection, "ranked", side_effect=AssertionError("must use cache")):
        assert selection.get() == result
    page = Discovery(books.search).page("book", 24, 0)
    assert page.items[0].isbn_13 == ISBN
    assert page.book_selection == result.info


def test_expired_selection_keeps_actual_source_date_on_failure(books: Books) -> None:
    selection = BookSelection(books.search)
    old = BookShelf(
        items=[books.item(volume())],
        info=BookSelectionInfo(
            period_start=date(2026, 10, 19),
            period_end=date(2026, 10, 25),
            checked_at=datetime(2026, 10, 26, tzinfo=UTC),
            selected_count=1,
        ),
    )
    with patch("app.metadata_cache.time.time", return_value=100):
        books.search.metadata.put("brazilian-books:v2", old.model_dump(mode="json"), ttl=1)
    with (
        patch("app.metadata_cache.time.time", return_value=102),
        patch.object(selection, "ranked", side_effect=SourceFailure()),
    ):
        result = selection.get()
    assert result.info.stale and result.info.period_start == date(2026, 10, 19)
    assert result.info.checked_at == old.info.checked_at
    assert result.items == old.items


def test_public_rankings_interleave_categories_and_deduplicate_isbn(books: Books) -> None:
    selection = BookSelection(books.search)

    def response(path: str, params: dict[str, str | int]) -> Any:
        if path.endswith("/mes"):
            return [{"mes": "10/2026"}]
        if path.endswith("/semana"):
            return [{"data_inicio_semana": "2026-10-19T03:00:00Z"}]
        return {
            "2": [{"sku": ISBN}, {"sku": "9780441172719"}],
            "4": [{"sku": "9786555607284"}],
            "3": [{"sku": ISBN}],
        }[str(params["id_categoria"])]

    with patch.object(selection, "request", side_effect=response):
        rows, start = selection.ranked()
    assert [row["sku"] for row in rows] == [ISBN, "9786555607284", "9780441172719"]
    assert start == date(2026, 10, 19)
