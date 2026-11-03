import io
import json
import logging
from collections.abc import Iterator, Sequence
from concurrent.futures import ThreadPoolExecutor
from email.message import Message
from typing import Any
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app import observability
from app.catalog_writer import CatalogWriter
from app.core.config import Settings
from app.main import create_app
from app.observability import LookupStat
from app.request_context import RequestContextMiddleware
from app.search import ProviderHTTP, SourceFailure

SECRET = "sb_secret_" + "x" * 30
GOOGLE = "https://www.googleapis.com/books/v1/volumes?q=duna"


class RecordingWriter(CatalogWriter):
    def __init__(self) -> None:
        super().__init__(Settings(_env_file=None, environment="test"))
        self.batches: list[list[LookupStat]] = []

    def insert_lookup_stats(self, stats: Sequence[LookupStat]) -> bool:
        self.batches.append(list(stats))
        return True


def response(payload: object) -> MagicMock:
    handle = MagicMock()
    handle.__enter__.return_value.read.return_value = json.dumps(payload).encode()
    return handle


@pytest.fixture
def logs() -> Iterator[list[str]]:
    lines: list[str] = []

    class Collect(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            lines.append(record.getMessage())

    handler = Collect()
    observability.logger.addHandler(handler)
    previous = observability.logger.level
    observability.logger.setLevel(logging.INFO)
    yield lines
    observability.logger.removeHandler(handler)
    observability.logger.setLevel(previous)


def measured_app(writer: CatalogWriter) -> FastAPI:
    app = FastAPI()
    app.add_middleware(RequestContextMiddleware, writer=writer, origins=["http://localhost:5173"])
    http = ProviderHTTP()

    @app.get("/api/v1/books")
    def books() -> dict[str, int]:
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [
                observability.submit(executor, http.request, GOOGLE + str(n), cache=False)
                for n in range(2)
            ]
            return {"count": len([future.result() for future in futures])}

    @app.get("/api/v1/broken")
    def broken() -> None:
        raise RuntimeError("detalhe interno com dado do usuário")

    @app.get("/api/v1/unavailable")
    def unavailable() -> None:
        raise HTTPException(503, "Fonte indisponível.")

    return app


def test_request_id_is_generated_kept_or_replaced() -> None:
    client = TestClient(create_app(Settings(_env_file=None, environment="test")))
    generated = client.get("/health").headers["x-request-id"]
    assert len(generated) == 36
    kept = client.get("/health", headers={"x-request-id": "abc-12345"})
    assert kept.headers["x-request-id"] == "abc-12345"
    replaced = client.get("/health", headers={"x-request-id": "bad id\r\nx"})
    assert replaced.headers["x-request-id"] != "bad id\r\nx"


def test_server_timing_and_cors_exposure() -> None:
    client = TestClient(create_app(Settings(_env_file=None, environment="test")))
    result = client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert "total;dur=" in result.headers["server-timing"]
    exposed = result.headers["access-control-expose-headers"].lower()
    assert "x-request-id" in exposed and "server-timing" in exposed
    assert result.headers["timing-allow-origin"] == ("http://localhost:5173, http://127.0.0.1:5173")


def test_lookup_stats_are_collected_from_worker_threads_and_flushed_once() -> None:
    writer = RecordingWriter()
    client = TestClient(measured_app(writer))
    with patch("app.search.urlopen", return_value=response({"totalItems": 3})):
        result = client.get("/api/v1/books")
    assert result.json() == {"count": 2}
    assert "google;dur=" in result.headers["server-timing"]
    assert len(writer.batches) == 1
    calls = [(s.source, s.ok, s.hit) for s in writer.batches[0]]
    assert calls == [("google_books", True, True)] * 2


def test_requests_without_book_calls_write_nothing() -> None:
    writer = RecordingWriter()
    TestClient(measured_app(writer)).get("/api/v1/unavailable")
    assert writer.batches == []


@pytest.mark.parametrize(
    ("error", "ok"),
    [
        (HTTPError(GOOGLE, 429, "Too Many", Message(), io.BytesIO()), False),
        (HTTPError(GOOGLE, 503, "Down", Message(), io.BytesIO()), False),
        (HTTPError(GOOGLE, 404, "Missing", Message(), io.BytesIO()), True),
        (TimeoutError(), False),
    ],
)
def test_failed_calls_are_recorded_with_ok_flag(error: Exception, ok: bool) -> None:
    state, token = observability.begin(None)
    try:
        with patch("app.search.urlopen", side_effect=error), pytest.raises(SourceFailure):
            ProviderHTTP().request(GOOGLE, cache=False)
    finally:
        observability.end(token)
    assert [(s.source, s.ok, s.hit) for s in state.lookups] == [("google_books", ok, False)]


def test_other_media_sources_are_timed_but_not_stored() -> None:
    state, token = observability.begin(None)
    try:
        with patch("app.search.urlopen", return_value=response({"results": []})):
            ProviderHTTP().request("https://api.themoviedb.org/3/search/movie?q=x", cache=False)
    finally:
        observability.end(token)
    assert state.lookups == [] and "tmdb" in state.stages


def test_book_hit_rules() -> None:
    assert observability.book_hit("google_books", {"totalItems": 0}) is False
    assert observability.book_hit("google_books", {"id": "x", "volumeInfo": {}}) is True
    assert observability.book_hit("open_library", {"numFound": 2}) is True
    assert observability.book_hit("open_library", {"key": "/works/OL1W"}) is True
    assert observability.book_hit("bookinfo", []) is False


def test_server_errors_carry_request_id_without_internal_details(logs: list[str]) -> None:
    client = TestClient(measured_app(RecordingWriter()), raise_server_exceptions=False)
    broken = client.get("/api/v1/broken", headers={"x-request-id": "req-12345"})
    assert broken.status_code == 500
    assert broken.json()["request_id"] == "req-12345"
    assert "dado do usuário" not in broken.text
    assert broken.headers["x-request-id"] == "req-12345"
    assert not any("dado do usuário" in line for line in logs)
    error = next(json.loads(line) for line in logs if '"unhandled_error"' in line)
    assert error["error_type"] == "RuntimeError" and error["request_id"] == "req-12345"


def test_http_5xx_from_routes_includes_request_id() -> None:
    client = TestClient(create_app(Settings(_env_file=None, environment="test")))
    with patch("app.search.FederatedSearch.lookup", side_effect=SourceFailure("down")):
        result = client.get(
            "/api/v1/search/details/google_books/volume/abc", headers={"x-request-id": "req-99999"}
        )
    assert result.status_code == 503
    assert result.json()["request_id"] == "req-99999"
    assert result.json()["detail"].startswith("Não foi possível")


def test_request_log_is_one_json_line_without_query_or_path_values(logs: list[str]) -> None:
    client = TestClient(create_app(Settings(_env_file=None, environment="test")))
    with patch("app.search.FederatedSearch.lookup", side_effect=SourceFailure("down")):
        client.get("/api/v1/search/details/google_books/volume/segredo123?x=segredo456")
    line = next(line for line in logs if '"event":"request"' in line)
    record: dict[str, Any] = json.loads(line)
    assert record["route"] == "/api/v1/search/details/{provider}/{entity}/{external_id}"
    assert record["status"] == 503 and record["request_id"]
    assert "segredo" not in line


def test_writer_without_key_is_a_no_op() -> None:
    writer = CatalogWriter(Settings(_env_file=None, environment="test"))
    with patch("app.catalog_writer.urlopen") as opened:
        assert writer.insert_lookup_stats([LookupStat("bookinfo", True, True, 10)]) is False
    opened.assert_not_called()


def test_writer_posts_batch_with_short_timeout_and_never_raises(logs: list[str]) -> None:
    settings = Settings(
        _env_file=None,
        environment="test",
        supabase_url="https://example.supabase.co",
        supabase_secret_key=SECRET,
    )
    writer = CatalogWriter(settings)
    stats = [LookupStat("open_library", True, False, 120)]
    with patch("app.catalog_writer.urlopen", return_value=response({})) as opened:
        assert writer.insert_lookup_stats(stats) is True
    request = opened.call_args.args[0]
    assert request.full_url == "https://example.supabase.co/rest/v1/lookup_stats"
    assert request.get_header("Apikey") == SECRET
    assert json.loads(request.data) == [
        {"source": "open_library", "ok": True, "hit": False, "ms": 120}
    ]
    assert opened.call_args.kwargs["timeout"] == 0.3
    with patch("app.catalog_writer.urlopen", side_effect=TimeoutError()):
        assert writer.insert_lookup_stats(stats) is False
    assert any('"lookup_stats_dropped"' in line for line in logs)
    assert not any(SECRET in line for line in logs)


def test_secret_key_must_be_a_secret_key_with_https_url() -> None:
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            supabase_url="https://example.supabase.co",
            supabase_secret_key="sb_publishable_" + "x" * 30,
        )
    with pytest.raises(ValidationError):
        Settings(_env_file=None, supabase_secret_key=SECRET)
    assert Settings(
        _env_file=None, supabase_url="https://example.supabase.co", supabase_secret_key=SECRET
    ).supabase_secret_key
