"""The only module that uses NEXO_SUPABASE_SECRET_KEY.

It writes operational data that users must not touch (see docs/prompt-nexo-catalogo.md,
"Escrita no banco"). Without the key every method is a no-op, so the app keeps working
read-only. Failures are logged and swallowed: a write must never break a response.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from dataclasses import asdict
from urllib.error import HTTPError, URLError
from urllib.request import Request

from app.core.config import Settings
from app.http_pool import urlopen
from app.observability import LookupStat, log_event

STATS_TIMEOUT = 0.3
MAX_STATS_PER_REQUEST = 100


class CatalogWriter:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    @property
    def enabled(self) -> bool:
        return (
            self.settings.supabase_secret_key is not None and self.settings.supabase_url is not None
        )

    def _post(self, path: str, body: object, timeout: float) -> None:
        assert self.settings.supabase_secret_key is not None
        request = Request(
            str(self.settings.supabase_url).rstrip("/") + path,
            data=json.dumps(body).encode(),
            headers={
                "apikey": self.settings.supabase_secret_key.get_secret_value(),
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
            method="POST",
        )
        with urlopen(request, timeout=timeout) as response:
            response.read(1024)

    def insert_lookup_stats(self, stats: Sequence[LookupStat]) -> bool:
        if not self.enabled or not stats:
            return False
        rows = [asdict(stat) for stat in stats[:MAX_STATS_PER_REQUEST]]
        try:
            self._post("/rest/v1/lookup_stats", rows, STATS_TIMEOUT)
            return True
        except HTTPError as error:
            log_event("lookup_stats_dropped", reason="http", status=error.code, rows=len(rows))
        except (URLError, TimeoutError, OSError):
            log_event("lookup_stats_dropped", reason="network", rows=len(rows))
        return False
