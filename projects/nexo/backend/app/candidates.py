from __future__ import annotations

import json
import logging
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any
from urllib.parse import urlsplit

from pydantic import TypeAdapter

from app.catalog import MediaItem, MediaType
from app.runtime_paths import CACHE_ROOT
from app.search import FederatedSearch, clean

ROOT = CACHE_ROOT / "discovery"


def media_identity(item: MediaItem) -> str:
    if item.media_type == "book" and item.isbn_13:
        return "book:isbn:" + item.isbn_13
    if item.provider == "google_books" and item.external_id:
        return "google_books:volume:" + item.external_id
    url = urlsplit(str(item.source_url))
    return url.netloc.removeprefix("www.").casefold() + url.path.rstrip("/").casefold()


class CandidatePool:
    def __init__(self, search: FederatedSearch) -> None:
        self.search = search
        self.lock = threading.Lock()
        self.items: dict[str, MediaItem] = {}
        self.expanded: dict[str, float] = {}
        path = ROOT / "candidates.json"
        if path.exists() and path.stat().st_size < 30_000_000:
            try:
                raw = json.loads(path.read_text(encoding="utf-8"))
                self.items = {
                    media_identity(item): item
                    for item in TypeAdapter(list[MediaItem]).validate_python(raw["items"])
                }
                self.expanded = raw.get("expanded", {})
            except (ValueError, KeyError, TypeError):
                self.items = {}

    def add(self, items: list[MediaItem], key: str | None = None) -> None:
        with self.lock:
            for item in items:
                self.items[media_identity(item)] = item.model_copy(
                    update={"description": (item.description or "")[:4000] or None}
                )
            self.items = dict(list(self.items.items())[-1600:])
            if key:
                self.expanded[key] = time.time()
            ROOT.mkdir(parents=True, exist_ok=True)
            path = ROOT / "candidates.tmp"
            path.write_text(
                json.dumps(
                    {
                        "items": [i.model_dump(mode="json") for i in self.items.values()],
                        "expanded": self.expanded,
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            path.replace(ROOT / "candidates.json")

    def tmdb_rows(self, data: dict[str, Any], entity: str) -> list[MediaItem]:
        genres = self.search._tmdb(f"genre/{entity}/list")
        labels = {g["id"]: g["name"] for g in genres.get("genres", [])}
        result: list[MediaItem] = []
        for raw in data.get("results", [])[:20]:
            if raw.get("adult"):
                continue
            row = {
                **raw,
                "genres": [{"name": labels[g]} for g in raw.get("genre_ids", []) if g in labels],
            }
            try:
                result.append(self.search._tmdb_item(row, entity))
            except (ValueError, KeyError, TypeError):
                continue
        return result

    def fetch(self, query: str, category: MediaType) -> list[MediaItem]:
        if category in {"movie", "series"}:
            entity = "movie" if category == "movie" else "tv"
            return self.tmdb_rows(
                self.search._tmdb(f"search/{entity}", {"query": query, "include_adult": "false"}),
                entity,
            )
        if category == "book":
            result = self.search.books(query, 1)[0]
            for i, item in enumerate(result[:4]):
                try:
                    work = self.search.http.request(
                        f"https://openlibrary.org/works/{item.external_id}.json"
                    )
                    description = work.get("description")
                    if isinstance(description, dict):
                        description = description.get("value")
                    result[i] = item.model_copy(
                        update={
                            "description": clean(description) or item.description,
                            "genres": [
                                clean(subject, 80)
                                for subject in work.get("subjects", [])[:20]
                                if isinstance(subject, str)
                            ],
                        }
                    )
                except Exception:
                    logging.getLogger(__name__).warning(
                        "Book enrichment unavailable; keeping public search metadata."
                    )
            return result
        if category == "manga":
            return self.search.manga(query, 1)[0]
        return self.search.games(query, 1)[0]

    def related(self, item: MediaItem) -> None:
        key = media_identity(item)
        if time.time() - self.expanded.get(key, 0) < 86400:
            return
        try:
            url = urlsplit(str(item.source_url))
            match = re.fullmatch(r"/(movie|tv)/(\d+)", url.path.rstrip("/"))
            if url.netloc.removeprefix("www.") == "themoviedb.org" and match:
                found = self.tmdb_rows(
                    self.search._tmdb(f"{match[1]}/{match[2]}/recommendations"), match[1]
                )
            else:
                query = item.creators[0] if item.creators else item.title
                found = self.fetch(query, item.media_type)
            self.add(found, key)
        except Exception:
            logging.getLogger(__name__).warning(
                "Related public candidates unavailable; using the cached pool."
            )
            return

    def warm(self) -> dict[str, int]:
        queries: dict[MediaType, list[str]] = {
            "movie": [
                "A Chegada",
                "A viagem de Chihiro",
                "Aftersun",
                "O fabuloso destino de Amélie Poulain",
            ],
            "series": ["The Good Place", "Pachinko", "Station Eleven", "Arcane"],
            "book": ["Ursula Le Guin", "Octavia Butler", "Machado de Assis", "Clarice Lispector"],
            "manga": ["Witch Hat Atelier", "Pluto", "Yokohama Kaidashi Kikou", "Vagabond"],
            "game": ["Outer Wilds", "Disco Elysium", "Spiritfarer", "Hollow Knight"],
        }

        def work(job: tuple[MediaType, str]) -> None:
            category, query = job
            try:
                self.add(self.fetch(query, category))
            except Exception:
                logging.getLogger(__name__).warning(
                    "A discovery provider could not complete its public query."
                )
                return

        with ThreadPoolExecutor(max_workers=5) as executor:
            list(
                executor.map(
                    work,
                    [(category, query) for category, terms in queries.items() for query in terms],
                )
            )
        return {
            category: sum(item.media_type == category for item in self.items.values())
            for category in queries
        }


if __name__ == "__main__":
    from app.catalog import Catalog
    from app.core.config import Settings
    from app.personalization import document
    from app.semantic import LocalEmbeddings

    config = Settings()
    pool = CandidatePool(FederatedSearch(config, Catalog(config)))
    print(pool.warm(), flush=True)
    print(
        "Vetores públicos preparados:",
        len(LocalEmbeddings().encode([document(item) for item in pool.items.values()])),
    )
