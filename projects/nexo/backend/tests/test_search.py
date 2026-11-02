import json
from email.message import Message
from pathlib import Path
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.search import create_search_router
from app.catalog import Catalog, CatalogPage, MediaItem
from app.core.config import Settings
from app.metadata_cache import MetadataCache
from app.search import FederatedSearch, NotConfigured, ProviderHTTP, SourceFailure, make_item


@pytest.fixture
def search(tmp_path: Path) -> FederatedSearch:
    settings = Settings(_env_file=None, catalog_source="local", tmdb_read_token="test-token")
    return FederatedSearch(settings, Catalog(settings), MetadataCache(tmp_path / "public.sqlite3"))


def manga_item() -> MediaItem:
    return make_item(
        "kitsu",
        "manga",
        "35",
        title="Naruto",
        media_type="manga",
        source_url="https://kitsu.app/manga/naruto",
    )


def test_live_search_preserves_other_sources_when_one_fails(search: FederatedSearch) -> None:
    with (
        patch.object(search, "tmdb", side_effect=SourceFailure()),
        patch.object(search, "books", return_value=([], False)),
        patch.object(search, "manga", return_value=([manga_item()], False)),
        patch.object(search, "games", side_effect=NotConfigured()),
    ):
        result = search.search("Naruto", None, 1)
    assert result.items == [manga_item()]
    statuses = {s.provider: s.status for s in result.sources}
    assert statuses["tmdb"] == "unavailable"
    assert statuses["igdb"] == "not_configured"
    assert statuses["kitsu"] == "ok"


def test_search_deduplicates_by_source_and_preserves_existing_ids(search: FederatedSearch) -> None:
    stored = search.catalog.items()[0].model_copy(
        update={"provider": "tmdb", "provider_entity_type": "movie", "external_id": "157336"}
    )
    external = make_item(
        "tmdb",
        "movie",
        "157336",
        title="Interstellar",
        media_type="movie",
        source_url="https://www.themoviedb.org/movie/157336",
    )
    with (
        patch.object(search, "tmdb", return_value=([external], False)),
        patch.object(
            search.catalog,
            "search",
            return_value=CatalogPage(items=[stored], total=1, limit=12, offset=0),
        ),
        patch.object(search.catalog, "canonical_items", return_value=[stored]),
    ):
        result = search.search("Interstellar", "movie", 1)
    assert result.items == [stored]
    assert result.items[0].slug == "interstellar"


def test_kitsu_parser_excludes_novels_and_uses_aliases(search: FederatedSearch) -> None:
    data = {
        "data": [
            {
                "id": "35",
                "attributes": {
                    "canonicalTitle": "NARUTO",
                    "titles": {"en": "Naruto", "ja_jp": "ナルト"},
                    "subtype": "manga",
                    "slug": "naruto",
                    "startDate": "1999-09-21",
                    "synopsis": "<b>Story</b>",
                    "posterImage": {
                        "original": "https://media.kitsu.app/manga/35/poster_image/abc.jpg"
                    },
                },
            },
            {"id": "99", "attributes": {"subtype": "novel"}},
        ],
        "links": {"next": "https://kitsu.io/api/edge/manga?page=2"},
    }
    with patch.object(search.http, "request", return_value=data):
        items, more = search.manga("Naruto", 1)
    assert len(items) == 1 and more
    assert items[0].media_type == "manga"
    assert items[0].release_year == 1999
    assert "ナルト" in items[0].aliases
    assert items[0].description == "Story"


@pytest.mark.parametrize("clock", [12.0, 7200.0])
def test_igdb_authentication_uses_post_body_and_caches_token(clock: float) -> None:
    settings = Settings(
        _env_file=None, igdb_client_id="client-id", igdb_client_secret="private-secret"
    )
    search = FederatedSearch(settings, Catalog(settings))
    game = {
        "id": 1942,
        "name": "The Witcher 3",
        "slug": "the-witcher-3",
        "url": "https://www.igdb.com/games/the-witcher-3",
        "cover": {"image_id": "co123"},
        "platforms": [{"name": "PC"}],
        "involved_companies": [{"developer": True, "company": {"name": "CD Projekt RED"}}],
    }
    with (
        patch("app.search.time.monotonic", return_value=clock),
        patch.object(
            search.http,
            "request",
            side_effect=[
                {"access_token": "private-token", "expires_in": 3600},
                {"client_id": "client-id", "expires_in": 3600},
                [game],
                [game],
            ],
        ) as request,
    ):
        items, _ = search.games("Witcher", 1)
        search.games("Witcher", 2)
    assert request.call_count == 4
    token_call = request.call_args_list[0]
    assert "private-secret" not in token_call.args[0]
    assert b"client_secret=private-secret" in token_call.kwargs["data"]
    assert token_call.kwargs["cache"] is False
    assert items[0].platforms == ["PC"]
    assert items[0].creators == ["CD Projekt RED"]


def test_igdb_query_escapes_search_text(search: FederatedSearch) -> None:
    with patch.object(search, "_igdb", return_value=[]) as request:
        search.games('game"; fields *; \\', 1)
    assert "search " + json.dumps('game"; fields *; \\') + ";" in request.call_args.args[0]


def test_provider_http_reuses_public_cache_and_blocks_unapproved_hosts() -> None:
    http = ProviderHTTP()
    response = MagicMock()
    response.__enter__.return_value = response
    response.read.return_value = b'{"docs":[]}'
    with patch("app.search.urlopen", return_value=response) as request:
        assert http.request("https://openlibrary.org/search.json?q=test") == {"docs": []}
        assert http.request("https://openlibrary.org/search.json?q=test") == {"docs": []}
    assert request.call_count == 1
    with pytest.raises(SourceFailure):
        http.request("http://127.0.0.1/private")


def test_rate_limit_cooldown_prevents_repeat_provider_calls() -> None:
    http = ProviderHTTP()
    headers = Message()
    headers["Retry-After"] = "60"
    error = HTTPError("https://kitsu.io/api/edge/manga", 429, "rate limited", headers, None)
    with patch("app.search.urlopen", side_effect=error) as request:
        for _ in range(2):
            with pytest.raises(SourceFailure):
                http.request("https://kitsu.io/api/edge/manga")
        assert request.call_count == 1


def test_search_route_validates_queries_and_provider_paths(search: FederatedSearch) -> None:
    app = FastAPI()
    app.include_router(create_search_router(search))
    client = TestClient(app)
    cases: list[dict[str, str | int]] = [
        {"q": "x"},
        {"q": "  "},
        {"q": "naruto", "page": 0},
        {"q": "naruto", "media_type": "music"},
    ]
    for params in cases:
        assert client.get("/api/v1/search", params=params).status_code == 422
    assert client.get("/api/v1/search/details/kitsu/manga/not-an-id").status_code == 422
    assert client.get("/api/v1/search/details/igdb/manga/35").status_code == 422


def test_title_identity_does_not_merge_different_providers_or_formats() -> None:
    movie = make_item(
        "tmdb",
        "movie",
        "1",
        title="Same",
        media_type="movie",
        source_url="https://www.themoviedb.org/movie/1",
    )
    series = make_item(
        "tmdb",
        "tv",
        "1",
        title="Same",
        media_type="series",
        source_url="https://www.themoviedb.org/tv/1",
    )
    assert movie.id != series.id
    assert (
        movie.id
        == make_item(
            "tmdb",
            "movie",
            "1",
            title="Changed",
            media_type="movie",
            source_url="https://www.themoviedb.org/movie/1",
        ).id
    )
