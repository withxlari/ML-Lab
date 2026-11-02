import json
import threading
from collections.abc import Iterator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request

import pytest

from app import http_pool


class Server(ThreadingHTTPServer):
    connections = 0
    close_after_response = False

    def handle_error(self, request: Any, client_address: Any) -> None:
        pass  # the stale-connection test resets sockets on purpose


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server: Server

    def setup(self) -> None:
        super().setup()
        self.server.connections += 1

    def log_message(self, format: str, *args: Any) -> None:
        pass

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        received = json.loads(self.rfile.read(length) or b"null")
        status = 404 if self.path == "/missing" else 200
        body = json.dumps({"path": self.path, "received": received}).encode()
        if self.path == "/big":
            body = b"x" * 10_000
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        if self.server.close_after_response:
            self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)
        if self.server.close_after_response:
            self.close_connection = True


@pytest.fixture
def server() -> Iterator[Server]:
    http_pool.clear()
    instance = Server(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=instance.serve_forever, args=(0.02,), daemon=True)
    thread.start()
    yield instance
    instance.shutdown()
    instance.server_close()
    http_pool.clear()


def post(server: Server, path: str, payload: object = None) -> Request:
    return Request(
        f"http://127.0.0.1:{server.server_address[1]}{path}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )


def call(server: Server, path: str = "/rpc", payload: object = None) -> Any:
    with http_pool.urlopen(post(server, path, payload), timeout=5) as response:
        return json.loads(response.read(1_000_000))


def test_sequential_calls_share_one_connection(server: Server) -> None:
    for number in range(5):
        assert call(server, payload={"n": number})["received"] == {"n": number}
    assert server.connections == 1


def test_http_errors_keep_urllib_contract_and_connection(server: Server) -> None:
    with pytest.raises(HTTPError) as error:
        call(server, "/missing")
    assert error.value.code == 404
    assert json.loads(error.value.read())["path"] == "/missing"
    call(server)
    assert server.connections == 1


def test_connection_closed_by_server_is_not_reused(server: Server) -> None:
    server.close_after_response = True
    call(server)
    call(server)
    assert server.connections == 2


def test_stale_idle_connection_is_retried_transparently(server: Server) -> None:
    call(server)
    # Simulate the server dropping the idle connection while it sits in the pool.
    for idle in http_pool._pool.idle.values():
        for _, connection in idle:
            assert connection.sock is not None
            connection.sock.close()
            connection.sock = None
    assert call(server, payload=1)["received"] == 1


def test_partially_read_body_closes_the_connection(server: Server) -> None:
    with http_pool.urlopen(post(server, "/big"), timeout=5) as response:
        assert len(response.read(100)) == 100
    call(server)
    assert server.connections == 2


def test_only_https_or_local_http_is_allowed() -> None:
    with pytest.raises(URLError):
        http_pool.urlopen(Request("http://example.com/rpc"), timeout=1)


def test_unreachable_host_raises_urlerror() -> None:
    with pytest.raises(URLError):
        http_pool.urlopen(Request("http://127.0.0.1:9/rpc", data=b"{}"), timeout=1)
