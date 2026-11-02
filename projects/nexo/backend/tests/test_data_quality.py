from unittest.mock import patch
from uuid import uuid4

import pytest

from app.account import AccountStore, AccountUser, LibraryFeedback, LibraryPage
from app.catalog import Catalog, CatalogPage, CatalogUnavailable, MediaItem
from app.core.config import Settings
from app.data_quality import prepare_catalog, prepare_item, prepare_library, read_catalog


@pytest.fixture
def item() -> MediaItem:
    return Catalog(Settings(_env_file=None, catalog_source="local")).items()[0]


def changed(item: MediaItem, **updates: object) -> MediaItem:
    return MediaItem.model_validate({**item.model_dump(), **updates})


def test_preparation_is_deterministic_and_preserves_originals(item: MediaItem) -> None:
    raw = changed(
        item,
        genres=["Ficção científica", "Science Fiction", "Drama", "drama"],
        creators=["  João Silva  ", "JOAO SILVA"],
        description="<p>Uma &amp; outra história.</p><script>ignore_this</script>",
    )
    before = raw.model_dump()
    result = prepare_item(raw)
    assert result.genre_keys == ["drama", "science_fiction"]
    assert result.creator_keys == ["joao silva"]
    assert result.description_text == "Uma & outra história."
    assert raw.model_dump() == before
    assert prepare_item(raw) == result


def test_unknown_labels_and_combined_categories_do_not_become_inferred_genres(
    item: MediaItem,
) -> None:
    result = prepare_item(changed(item, genres=["Sci-Fi & Fantasy", "Shounen", "Friendship"]))
    assert result.genre_keys == ["science_fiction_fantasy"]
    assert result.other_labels == ["friendship", "shounen"]
    assert "science_fiction" not in result.genre_keys and "fantasy" not in result.genre_keys
    assert prepare_item(changed(item, genres=["Ficção"])).genre_keys == ["fiction"]


def test_absent_metadata_remains_unknown_without_blocking_other_fields(item: MediaItem) -> None:
    result = prepare_item(
        changed(item, creators=[], genres=[], description=None, release_year=None)
    )
    assert result.valid and result.description_text is None and result.item.release_year is None
    assert result.creator_keys == result.genre_keys == []
    assert {issue.code for issue in result.issues} >= {
        "missing_creators",
        "missing_genres",
        "missing_description",
        "missing_year",
    }


def test_same_titles_in_different_media_are_not_duplicates(item: MediaItem) -> None:
    book = changed(item, id=str(uuid4()), slug="same-title-book", media_type="book")
    report = prepare_catalog([item, book])
    assert report.summary.valid == 2
    assert report.items[0].identity_key != report.items[1].identity_key


def test_provider_duplicates_are_blocked_even_when_uuid_and_slug_differ(item: MediaItem) -> None:
    movie = changed(
        item,
        provider="tmdb",
        provider_entity_type="movie",
        external_id="157336",
        source_url="https://www.themoviedb.org/movie/157336",
    )
    duplicate = changed(movie, id=str(uuid4()), slug="another-copy")
    report = prepare_catalog([movie, duplicate])
    assert report.summary.invalid == 2
    assert report.summary.issue_counts["duplicate_identity"] == 2


@pytest.mark.parametrize(
    "updates",
    [
        {"provider": "tmdb", "provider_entity_type": "tv", "external_id": "12"},
        {"provider": "tmdb", "provider_entity_type": "movie", "external_id": "bad"},
        {"provider": "open_library", "provider_entity_type": "work", "external_id": "OL1W"},
        {"external_id": "12"},
    ],
)
def test_inconsistent_identity_is_blocked(item: MediaItem, updates: dict[str, object]) -> None:
    result = prepare_item(changed(item, **updates))
    assert not result.valid and result.identity_key is None


def test_provider_source_host_must_match(item: MediaItem) -> None:
    result = prepare_item(
        changed(
            item,
            provider="tmdb",
            provider_entity_type="movie",
            external_id="12",
            source_url="https://example.invalid/12",
        )
    )
    assert not result.valid
    assert any(issue.code == "source_host_mismatch" for issue in result.issues)


def test_low_ratings_are_preserved_and_status_alone_is_not_a_taste(item: MediaItem) -> None:
    planned = changed(item, id=str(uuid4()), slug="planned")
    completed = changed(item, id=str(uuid4()), slug="completed")
    favorite = changed(item, id=str(uuid4()), slug="favorite")
    rows = [
        LibraryFeedback(media_key=item.slug, rating=1, status="paused", is_favorite=False),
        LibraryFeedback(media_key=planned.slug, rating=None, status="planned", is_favorite=False),
        LibraryFeedback(
            media_key=completed.slug, rating=None, status="completed", is_favorite=False
        ),
        LibraryFeedback(media_key=favorite.slug, rating=None, status="planned", is_favorite=True),
    ]
    result = prepare_library([item, planned, completed, favorite], rows)
    assert result.signal_count == 2 and result.without_explicit_signal == 2
    assert result.rated_count == result.favorite_count == 1
    assert result.signals[0].rating == 1
    assert result.signals[1].rating is None
    assert len(result.seen_keys) == 4
    assert (
        "email" not in result.model_dump_json() and "access_token" not in result.model_dump_json()
    )


def test_missing_feedback_is_not_silently_filled(item: MediaItem) -> None:
    report = prepare_library([item], [])
    assert report.excluded_invalid == 1 and report.signal_count == 0
    assert report.summary.issue_counts["missing_or_duplicate_preference"] == 1


def test_catalog_export_reads_all_pages(item: MediaItem) -> None:
    catalog = Catalog(Settings(_env_file=None, catalog_source="local"))
    with patch.object(
        catalog,
        "search",
        side_effect=[
            CatalogPage(items=[item] * 100, total=101, limit=100, offset=0),
            CatalogPage(items=[item], total=101, limit=100, offset=100),
        ],
    ) as search:
        assert len(read_catalog(catalog)) == 101
    assert search.call_args.args[3] == 100


@pytest.mark.parametrize("total", [101, 10001])
def test_export_refuses_partial_or_oversized_reads(item: MediaItem, total: int) -> None:
    catalog = Catalog(Settings(_env_file=None, catalog_source="local"))
    with patch.object(
        catalog, "search", return_value=CatalogPage(items=[item], total=total, limit=100, offset=0)
    ):
        with pytest.raises(CatalogUnavailable):
            read_catalog(catalog)


def test_account_preparation_uses_only_the_authenticated_library(item: MediaItem) -> None:
    settings = Settings(_env_file=None, catalog_source="local")
    store = AccountStore(settings, Catalog(settings))
    user = AccountUser(id=uuid4())
    entry = LibraryFeedback(media_key=item.slug, status="planned", rating=5, is_favorite=True)
    with patch.object(
        store,
        "library",
        return_value=LibraryPage(items=[item], entries=[entry], total=1, limit=100, offset=0),
    ) as load:
        report = store.preparation(user, "owner-token")
    assert load.call_args.args == (user, "owner-token", 100, 0)
    assert report.signal_count == 1


def test_export_refuses_a_changing_catalog_total(item: MediaItem) -> None:
    catalog = Catalog(Settings(_env_file=None, catalog_source="local"))
    with patch.object(
        catalog,
        "search",
        side_effect=[
            CatalogPage(items=[item] * 100, total=101, limit=100, offset=0),
            CatalogPage(items=[item], total=102, limit=100, offset=100),
        ],
    ):
        with pytest.raises(CatalogUnavailable):
            read_catalog(catalog)


@pytest.mark.parametrize("total", [2, 1001])
def test_account_preparation_refuses_partial_or_oversized_lists(
    item: MediaItem, total: int
) -> None:
    from fastapi import HTTPException

    settings = Settings(_env_file=None, catalog_source="local")
    store = AccountStore(settings, Catalog(settings))
    with (
        patch.object(
            store,
            "library",
            return_value=LibraryPage(items=[item], entries=[], total=total, limit=100, offset=0),
        ),
        pytest.raises(HTTPException) as result,
    ):
        store.preparation(AccountUser(id=uuid4()), "owner-token")
    assert result.value.status_code == 503
