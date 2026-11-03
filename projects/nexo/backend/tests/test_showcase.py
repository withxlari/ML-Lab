from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.book_selection import BookSelection, BookSelectionInfo, BookShelf
from app.catalog import Catalog, CatalogPage, CatalogUnavailable, MediaItem
from app.core.config import Settings
from app.discovery import Discovery
from app.isbn import book_id, book_slug
from app.main import create_app
from app.metadata_cache import MetadataCache
from app.search import FederatedSearch, make_item
from app.showcase import Showcase

ISBN = "9788576574941"
WEEK = date(2026, 10, 26)
SUPABASE = {
    "catalog_source": "supabase",
    "supabase_url": "https://example.supabase.co",
    "supabase_publishable_key": "sb_publishable_" + "p" * 20,
    "supabase_secret_key": "sb_secret_" + "s" * 30,
}
SECRET = "cron-secret-value-123"


def settings(**values: Any) -> Settings:
    return Settings(_env_file=None, environment="test", **values)


def stored_book(isbn: str = ISBN) -> MediaItem:
    return make_item(
        "google_books",
        "volume",
        "AbC_1",
        title="Duna",
        media_type="book",
        creators=["Frank Herbert"],
        source_url="https://books.google.com/books?id=AbC_1",
        isbn_13=isbn,
        language="pt",
    ).model_copy(update={"id": book_id(isbn), "slug": book_slug(isbn)})


def shelf(week: date = WEEK) -> BookShelf:
    return BookShelf(
        items=[stored_book()],
        info=BookSelectionInfo(
            period_start=week,
            period_end=week,
            checked_at=datetime(2026, 11, 2, tzinfo=UTC),
            selected_count=1,
        ),
    )


def search_for(tmp_path: Path, **values: Any) -> FederatedSearch:
    config = settings(**values)
    return FederatedSearch(config, Catalog(config), MetadataCache(tmp_path / "c.sqlite3"))


# --- quick win: books already in the catalog skip Google/Open Library -------------------------


def test_shelf_uses_catalog_books_and_only_looks_up_unknown_isbns(tmp_path: Path) -> None:
    selection = BookSelection(search_for(tmp_path, **SUPABASE))
    known = stored_book()
    rows = [
        {"sku": ISBN, "titulo": "Duna", "autor": "Frank Herbert"},
        {"sku": "9786586064254", "titulo": "Novo", "autor": "Alguém"},
    ]
    with (
        patch.object(selection, "request", return_value=[]),
        patch.object(
            selection.search.catalog,
            "search",
            return_value=CatalogPage(items=[known], total=1, limit=100, offset=0),
        ) as catalog_search,
        patch.object(selection.books, "edition", return_value=None) as edition,
        patch.object(selection.search, "store_books"),
    ):
        built = selection.build(rows, WEEK)
    assert catalog_search.call_args.args[4] == [book_slug(ISBN), book_slug("9786586064254")]
    edition.assert_called_once_with("9786586064254", "Novo", "Alguém")
    assert [item.slug for item in built.items] == [book_slug(ISBN), book_slug("9786586064254")]
    assert built.items[0].title == "Duna"


def test_shelf_build_survives_a_catalog_outage(tmp_path: Path) -> None:
    selection = BookSelection(search_for(tmp_path, **SUPABASE))
    with (
        patch.object(selection, "request", return_value=[]),
        patch.object(selection.search.catalog, "search", side_effect=CatalogUnavailable()),
        patch.object(selection.books, "edition", return_value=stored_book()) as edition,
        patch.object(selection.search, "store_books"),
    ):
        built = selection.build([{"sku": ISBN, "titulo": "Duna", "autor": "X"}], WEEK)
    edition.assert_called_once()
    assert len(built.items) == 1


# --- showcase ------------------------------------------------------------------------------


def test_current_shelf_is_read_once_per_minute(tmp_path: Path) -> None:
    showcase = Showcase(search_for(tmp_path, **SUPABASE))
    payload = shelf().model_dump(mode="json")
    with patch.object(showcase.search.catalog, "book_showcase", return_value=payload) as read:
        assert showcase.current() == showcase.current()
    read.assert_called_once()


def test_invalid_or_missing_payload_is_no_shelf(tmp_path: Path) -> None:
    showcase = Showcase(search_for(tmp_path, **SUPABASE))
    with patch.object(showcase.search.catalog, "book_showcase", return_value={"items": "x"}):
        assert showcase.stored() is None
    with patch.object(showcase.search.catalog, "book_showcase", return_value=None):
        assert showcase.stored() is None


@pytest.mark.parametrize(
    ("stored_week", "force", "status"),
    [
        (WEEK, False, "unchanged"),
        (date(2026, 10, 19), False, "generated"),
        (WEEK, True, "generated"),
        (None, False, "generated"),
    ],
)
def test_refresh_only_rebuilds_for_a_new_week_or_when_forced(
    tmp_path: Path, stored_week: date | None, force: bool, status: str
) -> None:
    showcase = Showcase(search_for(tmp_path, **SUPABASE))
    current = shelf(stored_week) if stored_week else None
    with (
        patch.object(showcase.selection, "ranked", return_value=([{"sku": ISBN}], WEEK)),
        patch.object(showcase, "stored", return_value=current),
        patch.object(showcase.selection, "build", return_value=shelf()) as build,
        patch.object(showcase.search.writer, "save_showcase", return_value=True) as save,
    ):
        result = showcase.refresh(force)
    assert result["status"] == status and result["week"] == "2026-10-26"
    assert build.called == (status == "generated") and save.called == build.called


# --- cron route ----------------------------------------------------------------------------


def client(**values: Any) -> TestClient:
    return TestClient(create_app(settings(**values)))


def test_cron_route_requires_the_exact_secret() -> None:
    api = client(**SUPABASE, CRON_SECRET=SECRET)
    assert api.get("/api/v1/internal/showcase").status_code == 401
    wrong = {"Authorization": "Bearer nope"}
    assert api.get("/api/v1/internal/showcase", headers=wrong).status_code == 401
    unconfigured = client(**SUPABASE)
    headers = {"Authorization": f"Bearer {SECRET}"}
    assert unconfigured.get("/api/v1/internal/showcase", headers=headers).status_code == 401


def test_cron_route_needs_the_secret_key_setup() -> None:
    api = client(CRON_SECRET=SECRET)  # no Supabase secret key: nothing could be stored
    headers = {"Authorization": f"Bearer {SECRET}"}
    assert api.get("/api/v1/internal/showcase", headers=headers).status_code == 503


@pytest.mark.parametrize(("status", "code"), [("generated", 200), ("write_failed", 503)])
def test_cron_route_refreshes_and_cleans_stats(status: str, code: int) -> None:
    api = client(**SUPABASE, CRON_SECRET=SECRET)
    result = {"status": status, "week": "2026-10-26", "items": 12}
    with (
        patch("app.showcase.Showcase.refresh", return_value=result) as refresh,
        patch("app.catalog_writer.CatalogWriter.cleanup_lookup_stats", return_value=3) as clean,
    ):
        answer = api.get(
            "/api/v1/internal/showcase?force=true",
            headers={"Authorization": f"Bearer {SECRET}"},
        )
    assert answer.status_code == code
    refresh.assert_called_once_with(True)
    clean.assert_called_once_with(90)
    if code == 200:
        assert answer.json()["stats_removed"] == 3


def test_cron_route_is_not_in_the_public_schema() -> None:
    assert "/api/v1/internal/showcase" not in client().get("/openapi.json").json()["paths"]


# --- discovery reads the stored shelf -------------------------------------------------------


def test_books_tab_reads_the_stored_shelf_and_never_builds_it(tmp_path: Path) -> None:
    discovery = Discovery(search_for(tmp_path, **SUPABASE))
    with (
        patch.object(discovery.showcase, "stored", return_value=shelf()),
        patch.object(discovery.books, "ranked", side_effect=AssertionError("built on request")),
        patch.object(discovery.books, "get", side_effect=AssertionError("built on request")),
        patch.object(
            discovery.search.catalog,
            "search",
            return_value=CatalogPage(items=[], total=0, limit=100, offset=0),
        ),
    ):
        page = discovery.page("book", 24, 0)
    assert [item.slug for item in page.items] == [book_slug(ISBN)]
    assert page.sources[0].provider == "bookinfo" and page.sources[0].status == "ok"
    assert page.book_selection is not None and page.book_selection.period_start == WEEK


def test_books_tab_without_a_stored_shelf_is_empty_not_slow(tmp_path: Path) -> None:
    discovery = Discovery(search_for(tmp_path, **SUPABASE))
    with (
        patch.object(discovery.showcase, "stored", side_effect=CatalogUnavailable()),
        patch.object(discovery.books, "ranked", side_effect=AssertionError("built on request")),
        patch.object(
            discovery.search.catalog,
            "search",
            return_value=CatalogPage(items=[], total=0, limit=100, offset=0),
        ),
    ):
        page = discovery.page("book", 24, 0)
    assert page.items == [] and page.sources[0].status == "unavailable"


def test_without_the_secret_key_the_shelf_is_still_built_on_request(tmp_path: Path) -> None:
    discovery = Discovery(search_for(tmp_path))
    with patch.object(discovery.books, "get", return_value=shelf()) as built:
        items, source = discovery.category("book")
    built.assert_called_once()
    assert [item.slug for item in items] == [book_slug(ISBN)] and source.status == "ok"


def test_cron_secret_uses_the_name_vercel_expects() -> None:
    config = settings(CRON_SECRET=SECRET)
    assert config.cron_secret is not None and config.cron_secret.get_secret_value() == SECRET
    assert Catalog(settings()).book_showcase() is None  # local mode: nothing stored
