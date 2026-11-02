from collections import OrderedDict
from time import monotonic

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send


class SecurityMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self.windows: OrderedDict[tuple[str, str], tuple[float, int]] = OrderedDict()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def secure_send(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.extend(
                    [
                        (b"x-content-type-options", b"nosniff"),
                        (b"x-frame-options", b"DENY"),
                        (b"referrer-policy", b"strict-origin-when-cross-origin"),
                        (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
                    ]
                )
                if scope["path"].startswith("/api/v1/me"):
                    headers = [
                        (key, value) for key, value in headers if key.lower() != b"cache-control"
                    ]
                    headers.append((b"cache-control", b"private, no-store"))
                message["headers"] = headers
            await send(message)

        path = scope["path"]
        if path.startswith("/api/") and scope["method"] != "OPTIONS":
            group, limit = "read", 120
            if path.startswith("/api/v1/search") or path == "/api/v1/people/search":
                group, limit = "search", 30
            elif path == "/api/v1/me/recommendations" or path == "/api/v1/me/people":
                group, limit = "recommendations", 12
            elif scope["method"] in {"POST", "PUT", "PATCH", "DELETE"}:
                group, limit = "write", 60
            key = (str((scope.get("client") or ("unknown", 0))[0]), group)
            now = monotonic()
            start, count = self.windows.pop(key, (now, 0))
            if now - start >= 60:
                start, count = now, 0
            self.windows[key] = start, count + 1
            while len(self.windows) > 10000:
                self.windows.popitem(last=False)
            if count >= limit:
                response = JSONResponse(
                    {"detail": "Muitas solicitações. Aguarde um pouco e tente novamente."},
                    status_code=429,
                    headers={"Retry-After": str(max(1, int(60 - (now - start))))},
                )
                await response(scope, receive, secure_send)
                return

        if scope["method"] in {"POST", "PUT", "PATCH"}:
            body = bytearray()
            while True:
                message = await receive()
                if message["type"] == "http.disconnect":
                    return
                body.extend(message.get("body", b""))
                if len(body) > 4 * 1024 * 1024:
                    await JSONResponse({"detail": "O envio excedeu o tamanho permitido."}, 413)(
                        scope, receive, secure_send
                    )
                    return
                if not message.get("more_body", False):
                    break
            delivered = False

            async def buffered_receive() -> Message:
                nonlocal delivered
                if not delivered:
                    delivered = True
                    return {"type": "http.request", "body": bytes(body), "more_body": False}
                return await receive()

            await self.app(scope, buffered_receive, secure_send)
        else:
            await self.app(scope, receive, secure_send)
