from __future__ import annotations

import argparse
import html
import json
import re
import unicodedata
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel

from app.catalog import Catalog, CatalogUnavailable, MediaItem, MediaType, normalize
from app.core.config import Settings

if TYPE_CHECKING:
    from app.account import LibraryFeedback

TAXONOMY_VERSION = "1"

GENRE_ALIASES = {
    "action": ("action", "ação"),
    "adventure": ("adventure", "aventura"),
    "action_adventure": ("action & adventure", "ação e aventura"),
    "animation": ("animation", "animação"),
    "comedy": ("comedy", "comédia"),
    "crime": ("crime",),
    "documentary": ("documentary", "documentário"),
    "drama": ("drama",),
    "family": ("family", "família"),
    "fantasy": ("fantasy", "fantasia"),
    "fiction": ("fiction", "ficção"),
    "history": ("history", "história"),
    "horror": ("horror", "terror"),
    "mystery": ("mystery", "mistério"),
    "poetry": ("poetry", "poesia"),
    "politics": ("politics", "política"),
    "romance": ("romance",),
    "science_fiction": ("science fiction", "ficção científica", "sci-fi", "sci fi"),
    "science_fiction_fantasy": ("sci-fi & fantasy",),
    "thriller": ("thriller", "suspense"),
    "war": ("war", "guerra"),
    "western": ("western", "faroeste"),
    "role_playing": ("role-playing (rpg)", "rpg", "role-playing"),
    "platformer": ("platform", "platformer"),
    "puzzle": ("puzzle",),
    "racing": ("racing", "corrida"),
    "shooter": ("shooter",),
    "strategy": ("strategy", "estratégia"),
    "simulation": ("simulator", "simulation", "simulação"),
    "hack_and_slash": ("hack and slash/beat 'em up",),
}
GENRES = {normalize(alias): key for key, aliases in GENRE_ALIASES.items() for alias in aliases}
IDENTITIES: dict[tuple[str, str], MediaType] = {
    ("tmdb", "movie"): "movie",
    ("tmdb", "tv"): "series",
    ("open_library", "work"): "book",
    ("google_books", "volume"): "book",
    ("kitsu", "manga"): "manga",
    ("igdb", "game"): "game",
}
SOURCE_HOSTS = {
    "tmdb": {"themoviedb.org", "www.themoviedb.org"},
    "open_library": {"openlibrary.org"},
    "google_books": {"books.google.com"},
    "kitsu": {"kitsu.app", "kitsu.io"},
    "igdb": {"igdb.com", "www.igdb.com"},
}


class QualityIssue(BaseModel):
    code: str
    severity: Literal["warning", "error"] = "warning"


class PreparedMedia(BaseModel):
    item: MediaItem
    identity_key: str | None
    title_key: str
    creator_keys: list[str]
    genre_keys: list[str]
    other_labels: list[str]
    description_text: str | None
    valid: bool
    issues: list[QualityIssue]


class QualitySummary(BaseModel):
    total: int
    valid: int
    invalid: int
    by_type: dict[str, int]
    issue_counts: dict[str, int]


class CatalogPreparation(BaseModel):
    schema_version: int = 1
    taxonomy_version: str = TAXONOMY_VERSION
    text_policy: str = "Source text preserved; language unverified; no automatic translation."
    summary: QualitySummary
    items: list[PreparedMedia]


class PreparedSignal(BaseModel):
    identity_key: str
    media_key: str
    rating: int | None
    is_favorite: bool
    status: str
    reaction: Literal["liked", "disliked"] | None = None


class LibraryPreparation(BaseModel):
    schema_version: int = 1
    taxonomy_version: str = TAXONOMY_VERSION
    summary: QualitySummary
    saved_count: int
    rated_count: int
    favorite_count: int
    signal_count: int
    without_explicit_signal: int
    excluded_invalid: int
    seen_keys: list[str]
    signals: list[PreparedSignal]
    items: list[PreparedMedia]


def clean_text(value: str) -> str:
    value = html.unescape(unicodedata.normalize("NFC", value))
    value = re.sub(r"<(script|style)\b[^>]*>.*?</\1\s*>", " ", value, flags=re.I | re.S)
    value = re.sub(r"<[^>]+>", " ", value)
    return " ".join(value.split())


def identity_key(item: MediaItem) -> str | None:
    if item.provider is None:
        return f"nexo:{item.id}" if not item.provider_entity_type and not item.external_id else None
    entity, external = item.provider_entity_type or "", item.external_id or ""
    if IDENTITIES.get((item.provider, entity)) != item.media_type:
        return None
    pattern = {
        "open_library": r"OL[1-9][0-9]*W",
        "google_books": r"[A-Za-z0-9_-]{1,80}",
    }.get(item.provider, r"[1-9][0-9]*")
    if not re.fullmatch(pattern, external):
        return None
    return f"{item.provider}:{entity}:{external}"


def prepare_item(item: MediaItem) -> PreparedMedia:
    key = identity_key(item)
    issues: list[QualityIssue] = []
    if key is None:
        issues.append(QualityIssue(code="invalid_provider_identity", severity="error"))
    if item.provider and urlsplit(str(item.source_url)).hostname not in SOURCE_HOSTS[item.provider]:
        issues.append(QualityIssue(code="source_host_mismatch", severity="error"))
    creators = sorted({normalize(clean_text(name)) for name in item.creators if clean_text(name)})
    labels = {normalize(clean_text(label)) for label in item.genres if clean_text(label)}
    genres = sorted({GENRES[label] for label in labels if label in GENRES})
    others = sorted(label for label in labels if label not in GENRES)
    description = clean_text(item.description or "") or None
    for missing, code in (
        (not creators, "missing_creators"),
        (not labels, "missing_genres"),
        (description is None, "missing_description"),
        (item.release_year is None, "missing_year"),
        (bool(others), "unmapped_labels"),
        (not genres and description is None, "no_genres_or_description"),
    ):
        if missing:
            issues.append(QualityIssue(code=code))
    return PreparedMedia(
        item=item,
        identity_key=key,
        title_key=normalize(clean_text(item.title)),
        creator_keys=creators,
        genre_keys=genres,
        other_labels=others,
        description_text=description,
        issues=issues,
        valid=not any(issue.severity == "error" for issue in issues),
    )


def summarize(items: list[PreparedMedia]) -> QualitySummary:
    return QualitySummary(
        total=len(items),
        valid=sum(item.valid for item in items),
        invalid=sum(not item.valid for item in items),
        by_type=dict(sorted(Counter(item.item.media_type for item in items).items())),
        issue_counts=dict(
            sorted(Counter(issue.code for item in items for issue in item.issues).items())
        ),
    )


def prepare_catalog(items: list[MediaItem]) -> CatalogPreparation:
    prepared = [prepare_item(item) for item in items]
    keys = Counter(item.identity_key for item in prepared if item.identity_key)
    ids = Counter(item.item.id for item in prepared)
    slugs = Counter(item.item.slug for item in prepared)
    for item in prepared:
        for duplicate, code in (
            (bool(item.identity_key and keys[item.identity_key] > 1), "duplicate_identity"),
            (ids[item.item.id] > 1, "duplicate_uuid"),
            (slugs[item.item.slug] > 1, "duplicate_slug"),
        ):
            if duplicate:
                item.issues.append(QualityIssue(code=code, severity="error"))
                item.valid = False
    return CatalogPreparation(summary=summarize(prepared), items=prepared)


def prepare_library(items: list[MediaItem], entries: list[LibraryFeedback]) -> LibraryPreparation:
    prepared = prepare_catalog(items).items
    by_slug = {entry.media_key: entry for entry in entries}
    entry_counts = Counter(entry.media_key for entry in entries)
    for item in prepared:
        count = entry_counts[item.item.slug]
        if count != 1:
            item.issues.append(
                QualityIssue(code="missing_or_duplicate_preference", severity="error")
            )
            item.valid = False
    signals: list[PreparedSignal] = []
    valid_count = 0
    for item in prepared:
        if not item.valid or item.identity_key is None:
            continue
        valid_count += 1
        entry = by_slug[item.item.slug]
        if entry.rating is not None or entry.is_favorite or entry.reaction is not None:
            signals.append(
                PreparedSignal(
                    identity_key=item.identity_key,
                    media_key=entry.media_key,
                    rating=entry.rating,
                    is_favorite=entry.is_favorite,
                    status=entry.status,
                    reaction=entry.reaction,
                )
            )
    return LibraryPreparation(
        summary=summarize(prepared),
        saved_count=len(items),
        rated_count=sum(s.rating is not None for s in signals),
        favorite_count=sum(s.is_favorite for s in signals),
        signal_count=len(signals),
        without_explicit_signal=valid_count - len(signals),
        excluded_invalid=len(items) - valid_count,
        seen_keys=sorted(
            {item.identity_key for item in prepared if item.valid and item.identity_key}
        ),
        signals=signals,
        items=prepared,
    )


def read_catalog(catalog: Catalog, maximum: int = 10000) -> list[MediaItem]:

    items: list[MediaItem] = []
    expected: int | None = None
    while True:
        page = catalog.search(None, "", 100, len(items))
        if page.offset != len(items) or page.limit != 100:
            raise CatalogUnavailable("Catalog returned unexpected pagination.")
        expected = page.total if expected is None else expected
        if page.total != expected or page.total > maximum:
            raise CatalogUnavailable("Catalog changed or exceeded the export limit; try again.")
        if len(page.items) != min(100, expected - len(items)):
            raise CatalogUnavailable("Catalog returned an incomplete page.")
        items.extend(page.items)
        if len(items) == expected:
            return items


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare and audit public catalog data. No ML.")
    parser.add_argument(
        "--output", type=Path, required=True, help="Generated JSON path; use .cache."
    )
    args = parser.parse_args()
    try:
        settings = Settings()
        prepared = prepare_catalog(read_catalog(Catalog(settings)))
    except (CatalogUnavailable, ValueError):
        parser.exit(1, "Catalog unavailable or invalid. No new export was written.\n")
    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "source": settings.catalog_source,
        **prepared.model_dump(mode="json"),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temp = args.output.with_suffix(args.output.suffix + ".tmp")
    temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(args.output)
    print(json.dumps(prepared.summary.model_dump(), ensure_ascii=False))
    if prepared.summary.invalid:
        parser.exit(2, "Export has blocked records. Inspect valid/issue flags before using it.\n")


if __name__ == "__main__":
    main()
