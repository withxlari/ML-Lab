import argparse
import hashlib
import json
import re
import time
import unicodedata
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

from pydantic import BaseModel, Field, field_validator

from app.catalog import MediaItem
from app.core.config import BACKEND_ROOT, Settings

ROOT = BACKEND_ROOT.parent
Record = dict[str, Any]


class ProviderError(Exception):
    pass


class ProviderClient:
    def __init__(self, token: str | None = None) -> None:
        self.token = token
        self.cache = ROOT / ".cache" / "provider-responses"
        self.last_request = 0.0
        self.fetched_at = datetime.now(UTC).isoformat()

    def fetch(self, url: str) -> Record:
        if urlsplit(url).hostname not in {"openlibrary.org", "api.themoviedb.org"}:
            raise ProviderError("Unapproved provider host.")
        self.cache.mkdir(parents=True, exist_ok=True)
        path = self.cache / (hashlib.sha256(url.encode()).hexdigest() + ".json")
        if path.exists() and time.time() - path.stat().st_mtime < 86400:
            cached: Record = json.loads(path.read_text(encoding="utf-8"))
            self.fetched_at = cached["fetched_at"]
            return dict(cached["data"])
        headers = {
            "User-Agent": "Nexo/0.1 (educational catalog; https://github.com/withxlari)",
            "Accept": "application/json",
        }
        if urlsplit(url).hostname == "api.themoviedb.org":
            if not self.token:
                raise ProviderError("Configure NEXO_TMDB_READ_TOKEN in backend/.env first.")
            headers["Authorization"] = f"Bearer {self.token}"
        for attempt in range(3):
            time.sleep(max(0, 1.1 - (time.monotonic() - self.last_request)))
            self.last_request = time.monotonic()
            try:
                with urlopen(Request(url, headers=headers), timeout=15) as response:
                    body = response.read(4_000_001)
                    if len(body) > 4_000_000:
                        raise ProviderError("Provider response exceeds the import size limit.")
                    data: object = json.loads(body)
                    if not isinstance(data, dict):
                        raise ProviderError("Invalid provider response.")
                    self.fetched_at = datetime.now(UTC).isoformat()
                    path.write_text(
                        json.dumps(
                            {"fetched_at": self.fetched_at, "data": data}, ensure_ascii=False
                        ),
                        encoding="utf-8",
                    )
                    return data
            except HTTPError as error:
                if error.code in {429, 502, 503, 504} and attempt < 2:
                    retry = error.headers.get("Retry-After", "2")
                    if retry.isdigit() and int(retry) <= 10:
                        time.sleep(max(1, int(retry)))
                        continue
                raise ProviderError(
                    f"Provider returned HTTP {error.code}; import not applied."
                ) from None
            except (URLError, TimeoutError, OSError, ValueError):
                raise ProviderError("Could not read provider data; import not applied.") from None
        raise ProviderError("Provider unavailable.")


def text(value: object, maximum: int = 500) -> str | None:
    if not isinstance(value, str):
        return None
    result = unicodedata.normalize("NFC", value).strip()
    if not result:
        return None
    if len(result) > maximum or any(ord(char) < 32 and char not in "\n\t\r" for char in result):
        raise ProviderError("Provider text exceeds the allowed format.")
    return result


def year(value: object) -> int | None:
    if isinstance(value, int) and not isinstance(value, bool) and 0 < abs(value) <= 9999:
        return value
    if isinstance(value, str) and re.match(r"^[0-9]{4}(?:-|$)", value):
        return year(int(value[:4]))
    return None


class ImportItem(BaseModel):
    provider: str
    provider_entity_type: str
    external_id: str
    slug: str
    title: str
    original_title: str | None = None
    media_type: str
    release_year: int | None = None
    creators: list[str] = Field(default_factory=list)
    platforms: list[str] = Field(default_factory=list)
    aliases: list[str] = Field(default_factory=list)
    genres: list[str] = Field(default_factory=list)
    poster_path: str | None = None
    description: str | None = None
    source_url: str
    metadata_source: str
    metadata_fetched_at: str
    description_language: str | None = None
    position: int = 100

    @field_validator("external_id")
    @classmethod
    def validate_external_id(cls, value: str) -> str:
        if not re.fullmatch(r"[0-9]+|OL[0-9]+W", value):
            raise ValueError("Use a scoped TMDB ID or Open Library work ID.")
        return value

    def validate_media(self) -> None:

        MediaItem.model_validate(
            {**self.model_dump(), "id": "00000000-0000-4000-8000-000000000001"}
        )
        expected = {
            ("tmdb", "movie"): "movie",
            ("tmdb", "tv"): "series",
            ("open_library", "work"): "book",
            ("kitsu", "manga"): "manga",
            ("igdb", "game"): "game",
        }
        if expected.get((self.provider, self.provider_entity_type)) != self.media_type:
            raise ProviderError("Provider identity does not match the media type.")
        datetime.fromisoformat(self.metadata_fetched_at)


GENRES = {
    "fantasy": "Fantasia",
    "science fiction": "Ficção científica",
    "fiction": "Ficção",
    "horror": "Terror",
    "mystery": "Mistério",
    "romance": "Romance",
    "adventure": "Aventura",
    "poetry": "Poesia",
}


def open_library_items(client: ProviderClient, query: str, limit: int) -> list[ImportItem]:
    params = urlencode(
        {
            "q": query,
            "lang": "pt",
            "limit": limit,
            "fields": "key,title,author_name,first_publish_year,cover_i",
        }
    )
    search = client.fetch(f"https://openlibrary.org/search.json?{params}")
    result: list[ImportItem] = []
    for doc in search.get("docs", [])[:limit]:
        work_id = str(doc.get("key", "")).removeprefix("/works/")
        if not re.fullmatch(r"OL[0-9]+W", work_id):
            continue
        work = client.fetch(f"https://openlibrary.org/works/{work_id}.json")
        if str(work.get("key", "")).removeprefix("/works/") != work_id:
            raise ProviderError("Open Library returned a different work identity.")
        description = work.get("description")
        if isinstance(description, dict):
            description = description.get("value")
        cover = doc.get("cover_i")
        subjects = {str(subject).casefold() for subject in work.get("subjects", [])}
        title = text(doc.get("title")) or text(work.get("title"))
        if title is None:
            continue
        result.append(
            ImportItem(
                provider="open_library",
                provider_entity_type="work",
                external_id=work_id,
                slug=f"open-library-work-{work_id.lower()}",
                title=title,
                media_type="book",
                release_year=year(work.get("first_publish_date")),
                creators=[name for value in doc.get("author_name", []) if (name := text(value))],
                genres=[label for subject, label in GENRES.items() if subject in subjects],
                poster_path=f"https://covers.openlibrary.org/b/id/{cover}-L.jpg?default=false"
                if isinstance(cover, int) and cover > 0
                else None,
                description=text(description, 20000),
                source_url=f"https://openlibrary.org/works/{work_id}",
                metadata_source="open_library",
                metadata_fetched_at=client.fetched_at,
                position=200 + len(result),
            )
        )
    return result


def tmdb_items(client: ProviderClient, entity: str, limit: int) -> list[ImportItem]:
    if entity not in {"movie", "tv"}:
        raise ProviderError("Unsupported TMDB entity.")
    if not client.token:
        raise ProviderError("Configure NEXO_TMDB_READ_TOKEN in backend/.env first.")
    listing = client.fetch(f"https://api.themoviedb.org/3/{entity}/popular?language=pt-BR&page=1")
    result: list[ImportItem] = []
    for summary in listing.get("results", [])[:limit]:
        source_id = summary.get("id")
        if not isinstance(source_id, int) or isinstance(source_id, bool) or source_id <= 0:
            continue
        data = client.fetch(
            f"https://api.themoviedb.org/3/{entity}/{source_id}?language=pt-BR&append_to_response=credits"
        )
        if data.get("id") != source_id or data.get("adult"):
            continue
        people = (
            data.get("created_by", [])
            if entity == "tv"
            else [
                person
                for person in data.get("credits", {}).get("crew", [])
                if person.get("job") == "Director"
            ]
        )
        poster = data.get("poster_path")
        result.append(
            ImportItem(
                provider="tmdb",
                provider_entity_type=entity,
                external_id=str(source_id),
                slug=f"tmdb-{entity}-{source_id}",
                title=text(data.get("title") or data.get("name")) or "",
                original_title=text(data.get("original_title") or data.get("original_name")),
                media_type="movie" if entity == "movie" else "series",
                release_year=year(data.get("release_date") or data.get("first_air_date")),
                creators=list(
                    dict.fromkeys(name for person in people if (name := text(person.get("name"))))
                ),
                genres=[
                    name for genre in data.get("genres", []) if (name := text(genre.get("name")))
                ],
                poster_path=f"https://image.tmdb.org/t/p/w500{poster}" if poster else None,
                description=text(data.get("overview"), 20000),
                source_url=f"https://www.themoviedb.org/{entity}/{source_id}",
                metadata_source="tmdb",
                metadata_fetched_at=client.fetched_at,
                position=(100 if entity == "movie" else 150) + len(result),
            )
        )
    return result


def import_sql(items: list[ImportItem]) -> str:
    unique: dict[tuple[str, str, str], ImportItem] = {}
    for item in items:
        item.validate_media()
        unique[(item.provider, item.provider_entity_type, item.external_id)] = item
    if not unique:
        raise ProviderError("No valid works were returned; no SQL generated.")
    payload = json.dumps(
        [item.model_dump() for item in unique.values()], ensure_ascii=False
    ).replace("'", "''")
    fields = list(ImportItem.model_fields)
    types = {
        "release_year": "smallint",
        "creators": "text[]",
        "genres": "text[]",
        "platforms": "text[]",
        "aliases": "text[]",
        "position": "integer",
        "metadata_fetched_at": "timestamptz",
    }
    definition = ",".join(f"{field} {types.get(field, 'text')}" for field in fields)

    updated = [
        field
        for field in fields
        if field
        not in {"provider", "provider_entity_type", "external_id", "slug", "position", "media_type"}
    ]
    assignments = ",\n".join(
        f"{field}=case when existing.metadata_source='manual' "
        f"then existing.{field} else excluded.{field} end"
        for field in updated
    )
    return (
        f"insert into public.catalog_items as existing ({','.join(fields)})\n"
        f"select {','.join(fields)} from jsonb_to_recordset('{payload}'::jsonb) "
        f"as x({definition})\n"
        f"on conflict (provider,provider_entity_type,external_id) do update set {assignments}\n"
        "returning id,slug,title,metadata_source;\n"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("provider", choices=["open-library", "tmdb"])
    parser.add_argument("--limit", type=int, default=12)
    parser.add_argument("--query", default="language:por subject:fantasy")
    parser.add_argument("--output", type=Path, default=ROOT / ".cache" / "catalog-import")
    args = parser.parse_args()
    if not 1 <= args.limit <= 20:
        parser.error("Use a small import: --limit must be between 1 and 20.")
    config = Settings()
    token = config.tmdb_read_token.get_secret_value() if config.tmdb_read_token else None
    client = ProviderClient(token)
    try:
        items = (
            open_library_items(client, args.query, args.limit)
            if args.provider == "open-library"
            else (tmdb_items(client, "movie", args.limit) + tmdb_items(client, "tv", args.limit))
        )
        sql = import_sql(items)
    except (ProviderError, ValueError) as error:
        parser.exit(1, f"Import stopped: {error}\n")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.with_suffix(".json").write_text(
        json.dumps([item.model_dump() for item in items], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    args.output.with_suffix(".sql").write_text(sql, encoding="utf-8")
    print(f"Prepared {len(items)} provider works. Review: {args.output.with_suffix('.sql')}")


if __name__ == "__main__":
    main()
