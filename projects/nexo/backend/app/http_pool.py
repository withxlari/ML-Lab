"""Keep-alive HTTPS for Supabase calls.

urllib.request.urlopen opens a new TCP + TLS connection for every call and closes it after
the response, which costs about 100 ms per call before the request is even sent. This module
keeps finished connections open and reuses them for the next call to the same host, across
requests on a warm instance.

`urlopen` here is a drop-in for the subset the app uses: it takes a urllib Request and a
timeout, returns a context-managed response with `read`, `status` and `headers`, and raises
urllib.error.HTTPError for 4xx/5xx and URLError for network failures, so callers keep their
current error handling.
"""

from __future__ import annotations

import http.client
import io
import ssl
import threading
import time
from types import TracebackType
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request

from app import observability

MAX_IDLE_PER_HOST = 4
# Servers drop idle connections after about a minute; never hand out one close to that.
MAX_IDLE_SECONDS = 45.0
ERROR_BODY_LIMIT = 65_536
LOCAL_HOSTS = {"127.0.0.1", "localhost"}

Connection = http.client.HTTPConnection
# Errors that mean "the server closed this idle connection before reading our request".
STALE = (http.client.RemoteDisconnected, ConnectionResetError, BrokenPipeError)


class _Pool:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.idle: dict[tuple[str, str, int], list[tuple[float, Connection]]] = {}
        self.context = ssl.create_default_context()

    def acquire(self, key: tuple[str, str, int], timeout: float) -> tuple[Connection, bool]:
        now = time.monotonic()
        with self.lock:
            idle = self.idle.get(key, [])
            while idle:
                since, connection = idle.pop()
                if now - since < MAX_IDLE_SECONDS and connection.sock is not None:
                    connection.timeout = timeout
                    connection.sock.settimeout(timeout)
                    return connection, True
                connection.close()
        scheme, host, port = key
        if scheme == "https":
            return http.client.HTTPSConnection(
                host, port, timeout=timeout, context=self.context
            ), False
        return http.client.HTTPConnection(host, port, timeout=timeout), False

    def release(self, key: tuple[str, str, int], connection: Connection) -> None:
        with self.lock:
            idle = self.idle.setdefault(key, [])
            if len(idle) < MAX_IDLE_PER_HOST:
                idle.append((time.monotonic(), connection))
                return
        connection.close()

    def clear(self) -> None:
        with self.lock:
            for idle in self.idle.values():
                for _, connection in idle:
                    connection.close()
            self.idle.clear()


_pool = _Pool()


class PooledResponse:
    def __init__(
        self,
        response: http.client.HTTPResponse,
        connection: Connection,
        key: tuple[str, str, int],
    ) -> None:
        self._response = response
        self._connection = connection
        self._key = key
        self.status = response.status
        self.headers = response.headers

    def read(self, amount: int | None = None) -> bytes:
        return self._response.read(amount)

    def __enter__(self) -> PooledResponse:
        return self

    def __exit__(
        self,
        kind: type[BaseException] | None,
        error: BaseException | None,
        trace: TracebackType | None,
    ) -> None:
        _finish(self._response, self._connection, self._key)


def _finish(
    response: http.client.HTTPResponse, connection: Connection, key: tuple[str, str, int]
) -> None:
    # Reusable only if the whole body was read and the server did not ask to close.
    if response.isclosed() and not response.will_close:
        _pool.release(key, connection)
    else:
        connection.close()


def _note_supabase(response: http.client.HTTPResponse) -> None:
    # x-envoy-upstream-service-time: ms Supabase spent behind its gateway (PostgREST + DB).
    upstream = response.headers.get("x-envoy-upstream-service-time", "")
    if upstream.isdigit():
        observability.add_ms("supabase_db", int(upstream))
    # cf-ray ends with the Cloudflare data center the request entered through (GRU, MIA...).
    ray = response.headers.get("cf-ray", "")
    if "-" in ray:
        observability.note("supabase_edge", ray.rsplit("-", 1)[-1])


def urlopen(request: Request, timeout: float) -> PooledResponse:
    url = request.full_url
    parts = urlsplit(url)
    host = parts.hostname or ""
    if parts.scheme != "https" and not (parts.scheme == "http" and host in LOCAL_HOSTS):
        raise URLError("Only HTTPS is supported.")
    key = (parts.scheme, host, parts.port or (443 if parts.scheme == "https" else 80))
    target = parts.path or "/"
    if parts.query:
        target += "?" + parts.query
    headers = {"User-Agent": "Nexo/0.1", **dict(request.header_items())}
    body = request.data if isinstance(request.data, bytes) else None

    for attempt in (1, 2):
        connection, reused = _pool.acquire(key, timeout)
        try:
            connection.request(request.get_method(), target, body=body, headers=headers)
            response = connection.getresponse()
        except STALE as error:
            connection.close()
            if reused and attempt == 1:
                continue  # an idle connection the server had already closed: retry on a new one
            raise URLError(error) from None
        except (OSError, http.client.HTTPException) as error:
            connection.close()
            raise URLError(error) from None
        if host.endswith(".supabase.co"):
            _note_supabase(response)
        if response.status >= 400:
            detail = response.read(ERROR_BODY_LIMIT)
            _finish(response, connection, key)
            raise HTTPError(
                url, response.status, response.reason, response.headers, io.BytesIO(detail)
            )
        return PooledResponse(response, connection, key)
    raise URLError("Could not reach the server.")  # pragma: no cover - loop always returns


def clear() -> None:
    """Close every idle connection (tests, shutdown)."""
    _pool.clear()
