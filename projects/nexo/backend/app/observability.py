"""Per-request measurement: request id, Server-Timing stages, book lookup stats and JSON logs.

The state lives in a ContextVar. Thread pools do not inherit it on their own, so code that
fans out work must use `submit`, which runs the task inside a copy of the current context.
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
import uuid
from collections.abc import Callable, Iterator
from concurrent.futures import Executor, Future
from contextlib import contextmanager
from contextvars import ContextVar, copy_context
from dataclasses import dataclass, field
from typing import Any, Literal

BookSource = Literal["google_books", "open_library", "bookinfo"]

BOOK_SOURCES: dict[str, BookSource] = {
    "www.googleapis.com": "google_books",
    "openlibrary.org": "open_library",
    "www.bookinfo.com.br": "bookinfo",
}
STAGES = {
    "www.googleapis.com": "google",
    "openlibrary.org": "openlibrary",
    "www.bookinfo.com.br": "bookinfo",
    "api.themoviedb.org": "tmdb",
    "kitsu.io": "kitsu",
    "api.igdb.com": "igdb",
    "id.twitch.tv": "igdb",
}
REQUEST_ID = re.compile(r"[A-Za-z0-9-]{8,64}")
NOTE_VALUE = re.compile(r"[A-Za-z0-9_-]{1,16}")

logger = logging.getLogger("nexo")


@dataclass(frozen=True)
class LookupStat:
    source: BookSource
    ok: bool
    hit: bool
    ms: int


@dataclass
class RequestState:
    request_id: str
    started: float = field(default_factory=time.perf_counter)
    stages: dict[str, float] = field(default_factory=dict)
    lookups: list[LookupStat] = field(default_factory=list)
    notes: dict[str, str] = field(default_factory=dict)
    lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def add_stage(self, name: str, seconds: float) -> None:
        with self.lock:
            self.stages[name] = self.stages.get(name, 0.0) + seconds

    def note(self, name: str, value: str) -> None:
        with self.lock:
            self.notes[name] = value

    def add_lookup(self, stat: LookupStat) -> None:
        with self.lock:
            self.lookups.append(stat)

    def elapsed_ms(self) -> int:
        return round((time.perf_counter() - self.started) * 1000)

    def server_timing(self) -> str:
        with self.lock:
            parts = [f"{name};dur={seconds * 1000:.0f}" for name, seconds in self.stages.items()]
            parts += [f'{name};desc="{value}"' for name, value in self.notes.items()]
        return ", ".join([*parts, f"total;dur={self.elapsed_ms()}"])

    def stage_ms(self) -> dict[str, int]:
        with self.lock:
            return {name: round(seconds * 1000) for name, seconds in self.stages.items()}


_current: ContextVar[RequestState | None] = ContextVar("nexo_request", default=None)


def accept_request_id(value: str | None) -> str:
    if value and REQUEST_ID.fullmatch(value):
        return value
    return str(uuid.uuid4())


def begin(request_id: str | None) -> tuple[RequestState, Any]:
    state = RequestState(accept_request_id(request_id))
    region = os.environ.get("VERCEL_REGION", "")
    if NOTE_VALUE.fullmatch(region):
        state.note("region", region)
    return state, _current.set(state)


def end(token: Any) -> None:
    _current.reset(token)


def current() -> RequestState | None:
    return _current.get()


def request_id() -> str | None:
    state = _current.get()
    return state.request_id if state else None


def add_ms(stage: str, milliseconds: float) -> None:
    state = _current.get()
    if state:
        state.add_stage(stage, milliseconds / 1000)


def note(name: str, value: str) -> None:
    """A short label shown in Server-Timing, e.g. the region that served the request."""
    state = _current.get()
    if state and NOTE_VALUE.fullmatch(value):
        state.note(name, value)


@contextmanager
def timed(stage: str) -> Iterator[None]:
    started = time.perf_counter()
    try:
        yield
    finally:
        state = _current.get()
        if state:
            state.add_stage(stage, time.perf_counter() - started)


def book_hit(source: BookSource, result: object) -> bool:
    if source == "bookinfo":
        return bool(result)
    if not isinstance(result, dict):
        return False
    if source == "google_books":
        total = result.get("totalItems")
        return (isinstance(total, int) and total > 0) or "volumeInfo" in result
    found = result.get("numFound", result.get("num_found"))
    return (isinstance(found, int) and found > 0) or "key" in result


def record_call(host: str, ok: bool, result: object, seconds: float) -> None:
    """Record one real network call to an external source."""
    state = _current.get()
    if state is None:
        return
    state.add_stage(STAGES.get(host, "other"), seconds)
    source = BOOK_SOURCES.get(host)
    if source:
        state.add_lookup(
            LookupStat(
                source=source,
                ok=ok,
                hit=ok and book_hit(source, result),
                ms=max(0, round(seconds * 1000)),
            )
        )


def submit[**P, T](
    executor: Executor, fn: Callable[P, T], *args: P.args, **kwargs: P.kwargs
) -> Future[T]:
    """Like executor.submit, but the task sees this request's measurement state."""
    context = copy_context()

    def run() -> T:
        return context.run(fn, *args, **kwargs)

    return executor.submit(run)


def log_event(event: str, **fields: str | int | float | bool | None) -> None:
    """One JSON line per event. Callers pass only operational fields: never keys or user data."""
    record: dict[str, object] = {"event": event, "request_id": request_id(), **fields}
    logger.info(json.dumps(record, ensure_ascii=False, separators=(",", ":")))


def configure_logging() -> None:
    if logger.handlers:
        return
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False
