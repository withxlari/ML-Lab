import hashlib
import json
import sqlite3
import time
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from app.catalog import MediaItem


class MetadataCache:
    def __init__(self, path: Path) -> None:
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute(
                "create table if not exists responses "
                "(key text primary key, body text, expires real, saved real)"
            )
            db.execute(
                "create table if not exists works (key text primary key, body text, saved real)"
            )

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        db = sqlite3.connect(self.path, timeout=5)
        try:
            with db:
                yield db
        finally:
            db.close()

    def get(self, key: str, stale: bool = False) -> Any:
        with self.connect() as db:
            row = db.execute(
                "select body from responses where key = ? and expires > ?",
                (hashlib.sha256(key.encode()).hexdigest(), time.time() - (86400 if stale else 0)),
            ).fetchone()
        return json.loads(row[0]) if row else None

    def put(self, key: str, value: Any, ttl: int) -> None:
        body = json.dumps(value, ensure_ascii=False)
        with self.connect() as db:
            db.execute(
                "insert or replace into responses values (?, ?, ?, ?)",
                (hashlib.sha256(key.encode()).hexdigest(), body, time.time() + ttl, time.time()),
            )
            db.execute("delete from responses where expires < ?", (time.time() - 86400,))
            db.execute(
                "delete from responses where key not in "
                "(select key from responses order by saved desc limit 400)"
            )

            while (
                db.execute("select coalesce(sum(length(body)), 0) from responses").fetchone()[0]
                > 32_000_000
            ):
                db.execute(
                    "delete from responses where key = "
                    "(select key from responses order by saved limit 1)"
                )

    def remember(self, items: list[MediaItem]) -> None:
        with self.connect() as db:
            db.executemany(
                "insert or replace into works values (?, ?, ?)",
                [(str(item.source_url), item.model_dump_json(), time.time()) for item in items],
            )
            db.execute("delete from works where saved < ?", (time.time() - 30 * 86400,))
            db.execute(
                "delete from works where key not in "
                "(select key from works order by saved desc limit 5000)"
            )

    def works(self) -> list[MediaItem]:
        with self.connect() as db:
            rows = db.execute(
                "select body from works where saved > ? order by saved desc limit 1600",
                (time.time() - 30 * 86400,),
            ).fetchall()
        return [MediaItem.model_validate_json(row[0]) for row in rows]
