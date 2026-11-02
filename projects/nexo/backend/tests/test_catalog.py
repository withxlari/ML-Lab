from unittest.mock import MagicMock, patch
from urllib.error import URLError
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.catalog import Catalog, MediaItem
from app.core.config import Settings
from app.main import create_app


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app(Settings(_env_file=None, catalog_source="local")))


def test_catalog_pagination_and_stable_identity(client: TestClient) -> None:
    first = client.get("/api/v1/media?limit=2").json()
    second = client.get("/api/v1/media?limit=2&offset=2").json()
    assert first["total"] == 8
    assert len(first["items"]) == len(second["items"]) == 2
    assert first["items"][0]["id"] != second["items"][0]["id"]
    item = first["items"][0]
    assert client.get(f"/api/v1/media/{item['id']}").json() == item
    assert client.get("/api/v1/media").json()["items"][0]["id"] == item["id"]


def test_filter_search_and_distinct_dune_works(client: TestClient) -> None:
    assert client.get("/api/v1/media?media_type=book").json()["total"] == 2
    assert client.get("/api/v1/media?q=FICCAO").json()["total"] == 6
    assert client.get("/api/v1/media?q=jantje").json()["total"] == 1
    dune = client.get("/api/v1/media?q=duna").json()["items"]
    assert {item["media_type"] for item in dune} == {"book", "movie"}
    assert len({item["id"] for item in dune}) == 2
    assert client.get("/api/v1/media?q=inexistente").json()["items"] == []
    assert client.get("/api/v1/media?offset=999").json()["items"] == []


@pytest.mark.parametrize(
    "query", ["limit=0", "limit=101", "offset=-1", "media_type=music", "q=" + "a" * 201]
)
def test_reject_invalid_query(client: TestClient, query: str) -> None:
    assert client.get(f"/api/v1/media?{query}").status_code == 422


def test_missing_and_invalid_ids(client: TestClient) -> None:
    assert client.get(f"/api/v1/media/{uuid4()}").status_code == 404
    assert client.get("/api/v1/media/not-a-uuid").status_code == 422


def test_schema_nulls_and_invalid_metadata() -> None:
    item = Catalog(Settings(_env_file=None, catalog_source="local")).items()[0]
    data = item.model_dump()
    data.update(release_year=None, description=None, poster_path=None, creators=[])
    assert MediaItem.model_validate(data).release_year is None
    for field, value in [
        ("release_year", 0),
        ("release_year", True),
        ("release_year", 1.5),
        ("title", "  "),
        ("source_url", "http://example.com"),
        ("poster_path", "/images/../../secret"),
    ]:
        with pytest.raises(ValidationError):
            MediaItem.model_validate({**data, field: value})


def test_supabase_requires_explicit_configuration() -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, catalog_source="supabase")
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            catalog_source="supabase",
            supabase_url="https://example.supabase.co",
            supabase_publishable_key="sb_secret_forbidden",
        )


def supabase_settings() -> Settings:
    return Settings(
        _env_file=None,
        catalog_source="supabase",
        supabase_url="https://example.supabase.co",
        supabase_publishable_key="sb_publishable_test",
    )


def test_supabase_read_and_no_admin_credentials() -> None:
    response = MagicMock()
    item = Catalog(Settings(_env_file=None, catalog_source="local")).items()[0]
    response.read.return_value = (
        '{"items":[' + item.model_dump_json() + '],"total":5000,"limit":24,"offset":0}'
    ).encode()
    response.__enter__.return_value = response
    with patch("app.catalog.urlopen", return_value=response) as request:
        page = Catalog(supabase_settings()).search("movie", "ficcao", 24, 0)
        assert page.items == [item]
        assert page.total == 5000
    sent = request.call_args.args[0]
    assert sent.get_header("Apikey") == "sb_publishable_test"
    assert sent.get_header("Authorization") is None
    assert sent.full_url.endswith("/rpc/search_catalog")
    assert b'"p_query": "ficcao"' in sent.data
    assert b'"p_media_type": "movie"' in sent.data


def test_supabase_failure_is_503_without_silent_fallback() -> None:
    with patch("app.catalog.urlopen", side_effect=URLError("internal details")):
        client = TestClient(create_app(supabase_settings()))
        result = client.get("/api/v1/media")
        assert result.status_code == 503
        assert "internal details" not in result.text
        assert client.get("/health").status_code == 200


def test_supabase_detail_queries_one_uuid_instead_of_loading_all_items() -> None:
    response = MagicMock()
    response.read.return_value = b'{"items":[],"total":0,"limit":1,"offset":0}'
    response.__enter__.return_value = response
    media_id = uuid4()
    with patch("app.catalog.urlopen", return_value=response) as request:
        assert Catalog(supabase_settings()).get(media_id) is None
    assert str(media_id).encode() in request.call_args.args[0].data


def test_saved_slug_filter_and_validation(client: TestClient) -> None:
    assert client.get("/api/v1/media?slugs=severance").json()["total"] == 1
    assert client.get("/api/v1/media?slugs=missing").json()["total"] == 0
    assert client.get("/api/v1/media?slugs=bad,slug").status_code == 422
    assert client.get("/api/v1/media", params={"slugs": ["dark"] * 101}).status_code == 422


def test_approved_remote_posters_only() -> None:
    data = Catalog(Settings(_env_file=None, catalog_source="local")).items()[0].model_dump()
    for value in [
        "https://image.tmdb.org/t/p/w500/abc.jpg",
        "https://covers.openlibrary.org/b/id/123-L.jpg?default=false",
    ]:
        assert MediaItem.model_validate({**data, "poster_path": value}).poster_path == value
    for value in ["https://evil.example/image.jpg", "https://image.tmdb.org.evil/t/p/w500/a.jpg"]:
        with pytest.raises(ValidationError):
            MediaItem.model_validate({**data, "poster_path": value})
