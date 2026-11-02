from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.catalog import Catalog, MediaItem, MediaType
from app.core.config import Settings
from app.discovery import TYPES, Discovery
from app.metadata_cache import MetadataCache
from app.search import FederatedSearch, ProviderHTTP, SourceFailure, make_item


def setup(tmp_path: Path) -> Discovery:
    settings = Settings(_env_file=None, catalog_source="local")
    return Discovery(
        FederatedSearch(settings, Catalog(settings), MetadataCache(tmp_path / "data.sqlite3"))
    )


def work(category: MediaType, position: int = 1) -> MediaItem:
    return make_item(
        "tmdb",
        "movie",
        str(position),
        title=f"Trending {category} {position}",
        media_type=category,
        source_url=f"https://example.org/{category}/{position}",
    )


def test_discovery_interleaves_provider_rankings_before_editorial_catalog(tmp_path: Path) -> None:
    discovery = setup(tmp_path)
    with patch.object(
        discovery, "fetch", side_effect=lambda category: [work(category, 1), work(category, 2)]
    ) as fetch:
        first = discovery.page(None, 5, 0)
        second = discovery.page(None, 5, 5)
    assert [item.media_type for item in first.items] == TYPES
    assert [item.title for item in second.items] == [f"Trending {category} 2" for category in TYPES]
    assert fetch.call_count == 5


def test_feeds_refresh_after_six_hours_and_keep_last_good_result_on_failure(tmp_path: Path) -> None:
    discovery = setup(tmp_path)
    with (
        patch("app.metadata_cache.time.time", return_value=100000),
        patch.object(discovery, "fetch", return_value=[work("book")]) as fetch,
    ):
        discovery.page("book", 24, 0)
        discovery.page("book", 24, 0)
        assert fetch.call_count == 1
    with (
        patch("app.metadata_cache.time.time", return_value=100000 + 21601),
        patch.object(discovery, "fetch", side_effect=SourceFailure()),
    ):
        stale = discovery.page("book", 24, 0)
    assert stale.items[0].title == "Trending book 1"
    assert stale.sources[0].status == "unavailable"
    with (
        patch("app.metadata_cache.time.time", return_value=100000 + 21602),
        patch.object(discovery, "fetch", return_value=[work("book", 2)]),
    ):
        fresh = discovery.page("book", 24, 0)
    assert fresh.items[0].title == "Trending book 2"


def test_public_responses_survive_restarts_expire_and_do_not_store_tokens(tmp_path: Path) -> None:
    path = tmp_path / "public.sqlite3"
    cache = MetadataCache(path)
    response = MagicMock()
    response.__enter__.return_value = response
    response.read.return_value = b'{"docs":[]}'
    url = "https://openlibrary.org/search.json?q=public-title"
    with patch("app.search.urlopen", return_value=response) as request:
        ProviderHTTP(cache).request(url)
        ProviderHTTP(MetadataCache(path)).request(url)
        assert request.call_count == 1
        ProviderHTTP(cache).request(
            "https://id.twitch.tv/oauth2/token", data=b"client_secret=SECRET_SENTINEL", cache=False
        )
    with cache.connect() as db:
        rows = db.execute("select key, body from responses").fetchall()
    assert len(rows) == 1
    assert "public-title" not in rows[0][0]
    assert "SECRET_SENTINEL" not in path.read_bytes().decode(errors="ignore")
    with patch("app.metadata_cache.time.time", return_value=10):
        cache.put("expired", {"ok": True}, ttl=1)
    with patch("app.metadata_cache.time.time", return_value=12):
        assert cache.get("expired") is None


def test_discovery_uses_real_daily_weekly_and_game_visit_feeds(tmp_path: Path) -> None:
    discovery = setup(tmp_path)
    search = discovery.search
    with patch.object(search, "_tmdb", return_value={"results": [], "genres": []}) as tmdb:
        discovery.fetch("movie")
        assert tmdb.call_args_list[0].args[0] == "trending/movie/week"
    with patch.object(discovery.books, "get", return_value=SimpleNamespace(items=[])) as books:
        discovery.fetch("book")
        books.assert_called_once()
    with patch.object(search, "_igdb", return_value=[]) as igdb:
        discovery.fetch("game")
        assert igdb.call_args.kwargs["endpoint"] == "popularity_primitives"


def test_book_cover_prefers_the_selected_edition_and_keeps_original_publication_year(
    tmp_path: Path,
) -> None:
    search = setup(tmp_path).search
    item = search._book_item(
        {
            "key": "/works/OL123W",
            "title": "Book",
            "cover_i": 1,
            "first_publish_year": 1965,
            "editions": {"docs": [{"cover_i": 999}]},
        }
    )
    assert item.poster_path == "https://covers.openlibrary.org/b/id/999-L.jpg?default=false"
    assert item.release_year == 1965
    search.metadata.remember([item, item])
    assert search.metadata.works() == [item]
