import io
import json
from collections.abc import Iterator
from email.message import Message
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError

import pytest
from fastapi.testclient import TestClient

from app.catalog import Catalog, CatalogUnavailable, MediaItem
from app.catalog_writer import CatalogWriter, book_row
from app.core.config import Settings
from app.isbn import book_id, book_slug
from app.main import create_app
from app.metadata_cache import MetadataCache
from app.search import FederatedSearch, SearchPage, SourceFailure, make_item

ISBN = "9788576574941"
SUPABASE = {
    "supabase_url": "https://example.supabase.co",
    "supabase_publishable_key": "sb_publishable_" + "p" * 20,
    "supabase_secret_key": "sb_secret_" + "s" * 30,
}


def settings(**values: Any) -> Settings:
    return Settings(_env_file=None, environment="test", **values)


def google_book(isbn: str | None = ISBN, **values: Any) -> MediaItem:
    item = make_item(
        "google_books",
        "volume",
        "AbC_1",
        title="Duna",
        media_type="book",
        creators=["Frank Herbert"],
        source_url="https://books.google.com/books?id=AbC_1",
        isbn_13=isbn,
        **values,
    )
    if isbn:
        item = item.model_copy(update={"id": book_id(isbn), "slug": book_slug(isbn)})
    return item


def open_library_book(isbn: str | None = ISBN) -> MediaItem:
    item = make_item(
        "open_library",
        "work",
        "OL893415W",
        title="Dune",
        media_type="book",
        source_url="https://openlibrary.org/works/OL893415W",
        isbn_13=isbn,
    )
    if isbn:
        item = item.model_copy(update={"id": book_id(isbn), "slug": book_slug(isbn)})
    return item


def movie() -> MediaItem:
    return make_item(
        "tmdb",
        "movie",
        "157336",
        title="Interestelar",
        media_type="movie",
        source_url="https://www.themoviedb.org/movie/157336",
    )


def rpc_response(payload: object) -> MagicMock:
    handle = MagicMock()
    handle.__enter__.return_value.read.return_value = json.dumps(payload).encode()
    return handle


def sent(call: Any) -> Any:
    return json.loads(call.args[0].data)


# --- writer ---------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "values",
    [
        {},  # no secret key
        {**SUPABASE, "catalog_source": "local"},  # key, but the catalog is not read from Supabase
    ],
)
def test_books_are_not_written_without_key_or_outside_supabase_mode(values: Any) -> None:
    writer = CatalogWriter(settings(**values))
    with patch("app.catalog_writer.urlopen") as opened:
        assert writer.upsert_books([google_book()]) == []
        assert writer.claim_enrichment(book_slug(ISBN)) is False
    opened.assert_not_called()


def test_only_storable_books_are_sent_with_cut_texts() -> None:
    writer = CatalogWriter(settings(**SUPABASE, catalog_source="supabase"))
    long_book = google_book(
        description="d" * 6000,
        publisher="p" * 400,
        genres=["Ficção"] * 25,
    ).model_copy(update={"title": "T" * 400})
    bookinfo_only = long_book.model_copy(
        update={"provider": None, "provider_entity_type": None, "external_id": None}
    )
    with patch(
        "app.catalog_writer.urlopen", return_value=rpc_response([book_slug(ISBN)])
    ) as opened:
        assert writer.upsert_books([long_book, movie(), bookinfo_only]) == [book_slug(ISBN)]
    request = opened.call_args.args[0]
    assert request.full_url == "https://example.supabase.co/rest/v1/rpc/upsert_runtime_books"
    assert request.get_header("Apikey") == SUPABASE["supabase_secret_key"]
    (row,) = sent(opened.call_args)["p_items"]
    assert row["slug"] == book_slug(ISBN) and row["provider"] == "google_books"
    assert len(row["title"]) == 300 and len(row["description"]) == 5000
    assert len(row["publisher"]) == 300 and len(row["genres"]) == 20
    assert row["fetched_at"] and "is_adult" not in row and "aliases" not in row


def test_large_results_are_sent_in_batches_of_fifty() -> None:
    writer = CatalogWriter(settings(**SUPABASE, catalog_source="supabase"))
    books = [
        google_book(isbn=None).model_copy(update={"external_id": f"V{n}", "slug": f"b-{n}"})
        for n in range(120)
    ]
    with patch("app.catalog_writer.urlopen", return_value=rpc_response([])) as opened:
        writer.upsert_books(books)
    assert [len(sent(call)["p_items"]) for call in opened.call_args_list] == [50, 50, 20]


@pytest.fixture
def logs() -> Iterator[list[str]]:
    import logging

    from app import observability

    lines: list[str] = []

    class Collect(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            lines.append(record.getMessage())

    handler = Collect()
    observability.logger.addHandler(handler)
    observability.logger.setLevel(logging.INFO)
    yield lines
    observability.logger.removeHandler(handler)


def test_missing_migration_or_network_failure_never_raises(logs: list[str]) -> None:
    writer = CatalogWriter(settings(**SUPABASE, catalog_source="supabase"))
    missing = HTTPError("u", 404, "Not Found", Message(), io.BytesIO(b"{}"))
    with patch("app.catalog_writer.urlopen", side_effect=missing):
        assert writer.upsert_books([google_book()]) == []
        assert writer.claim_enrichment(book_slug(ISBN)) is False
    with patch("app.catalog_writer.urlopen", side_effect=TimeoutError()):
        assert writer.upsert_books([google_book()]) == []
    assert any('"catalog_write_failed"' in line and '"status":404' in line for line in logs)
    assert any('"enrichment_claim_failed"' in line for line in logs)
    assert not any(SUPABASE["supabase_secret_key"] in line for line in logs)


def test_claim_enrichment_is_true_only_for_a_true_answer() -> None:
    writer = CatalogWriter(settings(**SUPABASE, catalog_source="supabase"))
    with patch("app.catalog_writer.urlopen", return_value=rpc_response(True)) as opened:
        assert writer.claim_enrichment("book-isbn-1") is True
    assert sent(opened.call_args) == {"p_slug": "book-isbn-1"}
    with patch("app.catalog_writer.urlopen", return_value=rpc_response(False)):
        assert writer.claim_enrichment("book-isbn-1") is False


def test_book_row_drops_texts_that_end_up_empty() -> None:
    # MediaItem already rejects blank text; model_copy skips validation to test the safety net.
    item = google_book().model_copy(update={"publisher": "   ", "creators": ["  ", "Ana"]})
    row = book_row(item, "2026-11-02T00:00:00+00:00")
    assert row["publisher"] is None and row["creators"] == ["Ana"]


# --- search: catalog first, store and enrich --------------------------------------------------


@pytest.fixture
def search(tmp_path: Path) -> FederatedSearch:
    config = settings(**SUPABASE, catalog_source="supabase")
    return FederatedSearch(config, Catalog(config), MetadataCache(tmp_path / "public.sqlite3"))


def test_book_found_in_catalog_needs_no_external_call(search: FederatedSearch) -> None:
    stored = google_book(description="Sinopse")
    with (
        patch.object(search.catalog, "resolve_identity", return_value=stored) as resolve,
        patch.object(search.http, "request", side_effect=AssertionError("external call")),
    ):
        assert search.lookup("google_books", "volume", "AbC_1") == (stored, True)
    resolve.assert_called_once_with("google_books", "volume", "AbC_1")


def test_book_missing_from_catalog_is_fetched(search: FederatedSearch) -> None:
    fetched = google_book()
    with (
        patch.object(search.catalog, "resolve_identity", return_value=None),
        patch.object(search.catalog, "canonical_items", return_value=[]),
        patch.object(search, "_fetch", return_value=fetched) as fetch,
    ):
        assert search.lookup("google_books", "volume", "AbC_1") == (fetched, False)
    fetch.assert_called_once()


def test_catalog_outage_falls_back_to_sources(search: FederatedSearch) -> None:
    fetched = open_library_book()
    with (
        patch.object(search.catalog, "resolve_identity", side_effect=CatalogUnavailable()),
        patch.object(search.catalog, "canonical_items", side_effect=CatalogUnavailable()),
        patch.object(search, "_fetch", return_value=fetched),
    ):
        assert search.lookup("open_library", "work", "OL893415W") == (fetched, False)


def test_other_media_and_invalid_ids_skip_the_catalog_lookup(search: FederatedSearch) -> None:
    with (
        patch.object(search.catalog, "resolve_identity") as resolve,
        patch.object(search.catalog, "canonical_items", return_value=[]),
        patch.object(search, "_fetch", return_value=movie()),
    ):
        search.lookup("tmdb", "movie", "157336")
        search.lookup("open_library", "work", "not-a-work")
    resolve.assert_not_called()


def test_same_isbn_from_google_and_open_library_appears_once(search: FederatedSearch) -> None:
    with (
        patch.object(search, "books", return_value=([google_book(), open_library_book()], False)),
        patch.object(search.catalog, "search", side_effect=CatalogUnavailable()),
    ):
        page = search.search("duna", "book", 1)
    assert [item.slug for item in page.items] == [book_slug(ISBN)]
    assert page.items[0].provider == "google_books"


def test_complete_books_are_not_enriched(search: FederatedSearch) -> None:
    complete = google_book(description="Sinopse", poster_path="/images/duna.jpg")
    with patch.object(search.writer, "claim_enrichment") as claim:
        search.enrich(complete)
    claim.assert_not_called()


def test_enrichment_runs_only_with_the_claim_and_keeps_the_stored_slug(
    search: FederatedSearch,
) -> None:
    stored = open_library_book().model_copy(update={"slug": "book-isbn-9788576573821"})
    fresh = open_library_book().model_copy(update={"description": "Nova sinopse"})
    with (
        patch.object(search.writer, "claim_enrichment", return_value=False),
        patch.object(search, "_fetch") as fetch,
    ):
        search.enrich(stored)
    fetch.assert_not_called()
    with (
        patch.object(search.writer, "claim_enrichment", return_value=True),
        patch.object(search, "_fetch", return_value=fresh),
        patch.object(search.writer, "upsert_books") as upsert,
    ):
        search.enrich(stored)
    (written,) = upsert.call_args.args[0]
    assert written.slug == stored.slug and written.description == "Nova sinopse"


def test_enrichment_source_failure_is_swallowed(search: FederatedSearch) -> None:
    with (
        patch.object(search.writer, "claim_enrichment", return_value=True),
        patch.object(search, "_fetch", side_effect=SourceFailure("down")),
        patch.object(search.writer, "upsert_books") as upsert,
    ):
        search.enrich(open_library_book())
    upsert.assert_not_called()


# --- routes schedule the writes after the response ------------------------------------------


def test_search_route_stores_books_after_responding() -> None:
    client = TestClient(create_app(settings()))
    page = SearchPage(items=[google_book(), movie()], sources=[], page=1, has_more=False)
    with (
        patch("app.search.FederatedSearch.search", return_value=page),
        patch("app.search.FederatedSearch.store_search_results") as store,
    ):
        assert client.get("/api/v1/search?q=duna").status_code == 200
    store.assert_called_once_with("duna", page.items)


@pytest.mark.parametrize(("from_catalog", "task"), [(True, "enrich"), (False, "store_books")])
def test_details_route_enriches_catalog_hits_and_stores_fetched_books(
    from_catalog: bool, task: str
) -> None:
    client = TestClient(create_app(settings()))
    book = google_book()
    with (
        patch("app.search.FederatedSearch.lookup", return_value=(book, from_catalog)),
        patch(f"app.search.FederatedSearch.{task}") as scheduled,
    ):
        result = client.get("/api/v1/search/details/google_books/volume/AbC_1")
    assert result.status_code == 200 and result.json()["slug"] == book.slug
    scheduled.assert_called_once()
