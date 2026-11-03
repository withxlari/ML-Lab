"""ASGI middleware: request id, Server-Timing, one JSON log line and lookup stats per request."""

from __future__ import annotations

import json
import traceback

from starlette.concurrency import run_in_threadpool
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app import observability
from app.catalog_writer import CatalogWriter

GENERIC_ERROR = "Algo deu errado do nosso lado. Tente novamente."


class RequestContextMiddleware:
    def __init__(self, app: ASGIApp, writer: CatalogWriter, origins: list[str]) -> None:
        self.app = app
        self.writer = writer
        self.timing_origins = ", ".join(origins).encode() if origins else None

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = dict(scope.get("headers") or []).get(b"x-request-id")
        state, token = observability.begin(incoming.decode("latin-1") if incoming else None)
        status = 500
        started = False

        async def send_with_context(message: Message) -> None:
            nonlocal status, started
            if message["type"] == "http.response.start":
                started = True
                status = message["status"]
                headers = list(message.get("headers", []))
                headers.append((b"x-request-id", state.request_id.encode()))
                headers.append((b"server-timing", state.server_timing().encode()))
                if self.timing_origins:
                    headers.append((b"timing-allow-origin", self.timing_origins))
                message["headers"] = headers
            await send(message)

        try:
            await self.app(scope, receive, send_with_context)
        except Exception as error:
            frame = traceback.extract_tb(error.__traceback__)[-1]
            observability.log_event(
                "unhandled_error",
                error_type=type(error).__name__,
                where=f"{frame.filename.rsplit('/', 1)[-1]}:{frame.lineno}",
            )
            if started:
                raise
            body = json.dumps({"detail": GENERIC_ERROR, "request_id": state.request_id}).encode()
            await send_with_context(
                {
                    "type": "http.response.start",
                    "status": 500,
                    "headers": [(b"content-type", b"application/json")],
                }
            )
            await send({"type": "http.response.body", "body": body})
        finally:
            route = scope.get("route")
            observability.log_event(
                "request",
                method=scope.get("method"),
                route=getattr(route, "path", "unmatched"),
                status=status,
                ms=state.elapsed_ms(),
                stages=json.dumps(state.stage_ms(), separators=(",", ":")),
                lookups=len(state.lookups),
            )
            try:
                if state.lookups:
                    # No waitUntil on Vercel's Python runtime: write before the invocation
                    # ends, with a short timeout. Losing a few rows is acceptable.
                    await run_in_threadpool(self.writer.insert_lookup_stats, list(state.lookups))
            finally:
                observability.end(token)
