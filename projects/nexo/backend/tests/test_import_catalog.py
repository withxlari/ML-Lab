import json
from unittest.mock import patch

import pytest

from app.import_catalog import (
    ImportItem,
    ProviderClient,
    ProviderError,
    import_sql,
    open_library_items,
    tmdb_items,
    year,
)


def test_year_validation_does_not_invent_unknown_metadata() -> None:
    assert year("2023-01-05") == 2023
    assert year(None) is None
    assert year(True) is None
    assert year("unknown") is None
    assert year(0) is None


def test_tmdb_requires_token_before_any_network_call() -> None:
    with pytest.raises(ProviderError, match="NEXO_TMDB_READ_TOKEN"):
        tmdb_items(ProviderClient(), "movie", 12)


def test_open_library_uses_work_identity_and_preserves_missing_metadata() -> None:
    client = ProviderClient()
    with patch.object(
        client,
        "fetch",
        side_effect=[
            {
                "docs": [
                    {
                        "key": "/works/OL123W",
                        "title": "Livro",
                        "cover_i": 123,
                        "first_publish_year": 1981,
                        "author_name": ["Autora"],
                    }
                ]
            },
            {
                "key": "/works/OL123W",
                "description": {"value": "Sinopse real"},
                "subjects": ["Fantasy", "Politics"],
            },
        ],
    ):
        item = open_library_items(client, "fantasy", 1)[0]
    assert item.external_id == "OL123W"
    assert item.genres == ["Fantasia"]
    assert item.description == "Sinopse real"
    assert item.release_year is None
    assert item.description_language is None
    assert item.source_url.endswith("/works/OL123W")


def test_tmdb_movie_and_series_id_namespaces_and_credits() -> None:
    client = ProviderClient("test-token")
    with patch.object(
        client,
        "fetch",
        side_effect=[
            {"results": [{"id": 123}]},
            {
                "id": 123,
                "title": "Filme d'água",
                "release_date": "2020-01-01",
                "credits": {"crew": [{"job": "Director", "name": "Diretora"}]},
            },
            {"results": [{"id": 123}]},
            {
                "id": 123,
                "name": "Série",
                "first_air_date": "2021-01-01",
                "created_by": [{"name": "Criadora"}],
            },
        ],
    ):
        movie = tmdb_items(client, "movie", 1)[0]
        series = tmdb_items(client, "tv", 1)[0]
    assert movie.creators == ["Diretora"]
    assert series.creators == ["Criadora"]
    sql = import_sql([movie, movie, series])
    assert "Filme d''água" in sql
    assert "on conflict (provider,provider_entity_type,external_id)" in sql
    assert "existing.metadata_source='manual'" in sql
    assert "slug=case" not in sql
    assert "editorial_note=" not in sql
    assert sql.count('"external_id": "123"') == 2


def test_import_rejects_empty_batch_and_mismatched_identity() -> None:
    with pytest.raises(ProviderError):
        import_sql([])
    item = ImportItem(
        provider="open_library",
        provider_entity_type="work",
        external_id="OL12W",
        slug="ol-12",
        title="Book",
        media_type="movie",
        source_url="https://openlibrary.org/works/OL12W",
        metadata_source="open_library",
        metadata_fetched_at="2026-10-30T00:00:00+00:00",
    )
    with pytest.raises(ProviderError):
        import_sql([item])


def test_provider_cache_avoids_repeated_requests(tmp_path: object) -> None:
    from pathlib import Path

    client = ProviderClient()
    client.cache = Path(str(tmp_path))
    url = "https://openlibrary.org/works/OL1W.json"
    import hashlib

    path = client.cache / (hashlib.sha256(url.encode()).hexdigest() + ".json")
    path.write_text(
        json.dumps({"fetched_at": "2026-10-30T00:00:00+00:00", "data": {"key": "/works/OL1W"}})
    )
    with patch("app.import_catalog.urlopen") as request:
        assert client.fetch(url)["key"] == "/works/OL1W"
        request.assert_not_called()
    assert client.fetched_at == "2026-10-30T00:00:00+00:00"
