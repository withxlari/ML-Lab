from __future__ import annotations

import hashlib
import json
import math
import re
import threading
import time
import unicodedata
from collections import Counter
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, Field

from app.catalog import Catalog, MediaItem, MediaType
from app.data_quality import (
    GENRE_ALIASES,
    LibraryPreparation,
    PreparedMedia,
    PreparedSignal,
    prepare_catalog,
    read_catalog,
)
from app.text_experiment import PORTUGUESE_STOPWORDS

Strategy = Literal["genres", "text", "combined"]
MODEL_VERSION = "content-v1"
ENGLISH_STOPWORDS = frozenset(
    "a an the and or of to in on at is are was were be been with from by for as that this "
    "these those it its he she they them his her their who which when where while into "
    "but after before has have had will can could would should".split()
)
PT_ANCHORS = frozenset(
    (
        "de do da dos das que em um uma para por com se os as sua seu suas seus não "
        "ao aos na nas no nos pela pelo entre quando mas ele ela eles elas numa"
    ).split()
)
PT_DISTINCTIVE = frozenset(
    (
        "um uma não seu seus sua suas pelo pela dos das numa num ele ela eles elas aos com na ao"
    ).split()
)
EN_ANCHORS = frozenset(
    (
        "the and of to in is are with his her their from by when this that an for on "
        "they he she has have who was into but after"
    ).split()
)
GENRE_LABELS = {
    "action": "ação",
    "adventure": "aventura",
    "action_adventure": "ação e aventura",
    "animation": "animação",
    "comedy": "comédia",
    "crime": "crime",
    "drama": "drama",
    "documentary": "documentário",
    "family": "família",
    "fantasy": "fantasia",
    "fiction": "ficção",
    "history": "história",
    "horror": "terror",
    "mystery": "mistério",
    "poetry": "poesia",
    "politics": "política",
    "romance": "romance",
    "science_fiction": "ficção científica",
    "science_fiction_fantasy": "ficção científica e fantasia",
    "thriller": "suspense",
    "war": "guerra",
    "western": "faroeste",
    "role_playing": "RPG",
    "platformer": "plataforma",
    "puzzle": "quebra-cabeça",
    "racing": "corrida",
    "shooter": "tiro",
    "strategy": "estratégia",
    "simulation": "simulação",
    "hack_and_slash": "hack and slash",
}
assert set(GENRE_LABELS) == set(GENRE_ALIASES)


def words(text: str) -> list[str]:
    return re.findall(r"[^\W\d_]{2,}", unicodedata.normalize("NFC", text).casefold())


def language_hint(text: str) -> Literal["pt", "en"] | None:

    terms = set(words(text))
    pt, en = len(terms & PT_ANCHORS), len(terms & EN_ANCHORS)
    if pt >= 3 and pt >= en + 2 and len(terms & PT_DISTINCTIVE) >= 2:
        return "pt"
    if en >= 3 and en >= pt + 2:
        return "en"
    return None


def text_features(text: str, language: str) -> Counter[str]:
    stopwords = PORTUGUESE_STOPWORDS if language == "pt" else ENGLISH_STOPWORDS
    tokens = [token for token in words(text) if token not in stopwords]
    return Counter([*tokens, *(f"{a} {b}" for a, b in zip(tokens, tokens[1:], strict=False))])


def unit_vector(values: dict[str, float]) -> dict[str, float]:
    length = math.sqrt(sum(value * value for value in values.values()))
    return {key: value / length for key, value in values.items()} if length else {}


def dot(left: dict[str, float], right: dict[str, float]) -> float:
    return max(0.0, min(1.0, sum(value * right.get(key, 0.0) for key, value in left.items())))


@dataclass(frozen=True)
class TextSpace:
    document_count: int
    idf: dict[str, float]

    @classmethod
    def fit(cls, texts: list[str], language: str) -> TextSpace:
        frequency: Counter[str] = Counter()
        for text in texts:
            frequency.update(set(text_features(text, language)))

        return cls(
            len(texts),
            {
                term: 1 + math.log((1 + len(texts)) / (1 + count))
                for term, count in frequency.items()
            },
        )

    def transform(self, text: str, language: str) -> dict[str, float]:
        return unit_vector(
            {
                term: (1 + math.log(count)) * self.idf[term]
                for term, count in text_features(text, language).items()
                if term in self.idf
            }
        )


@dataclass(frozen=True)
class ItemVector:
    prepared: PreparedMedia
    genres: dict[str, float]
    text: dict[str, float]
    language: str | None


class CatalogIndex:
    def __init__(self, items: list[MediaItem]) -> None:
        prepared = prepare_catalog(items)
        self.total = len(items)
        self.excluded = prepared.summary.invalid
        valid = [row for row in prepared.items if row.valid and row.identity_key]
        self.spaces: dict[str, TextSpace] = {}
        for language in ("pt", "en"):
            texts = [
                row.description_text
                for row in valid
                if row.description_text and language_hint(row.description_text) == language
            ]
            self.spaces[language] = TextSpace.fit(texts, language)
        self.items = {row.identity_key: self.vector(row) for row in valid if row.identity_key}
        payload = json.dumps([row.model_dump(mode="json") for row in valid], sort_keys=True)
        self.fingerprint = hashlib.sha256(payload.encode()).hexdigest()[:16]

    def vector(self, row: PreparedMedia) -> ItemVector:
        language = language_hint(row.description_text or "")
        text = (
            self.spaces[language].transform(row.description_text or "", language)
            if language
            else {}
        )
        return ItemVector(row, unit_vector(dict.fromkeys(row.genre_keys, 1.0)), text, language)


class PairScore(BaseModel):
    score: float
    genre_similarity: float | None
    text_similarity: float | None
    shared_genres: list[str]
    shared_terms: list[str]


def compare(left: ItemVector, right: ItemVector, strategy: Strategy = "combined") -> PairScore:
    genre = dot(left.genres, right.genres) if left.genres and right.genres else None
    text = (
        dot(left.text, right.text)
        if left.language == right.language and left.text and right.text
        else None
    )
    weights = {"genres": (1.0, 0.0), "text": (0.0, 1.0), "combined": (0.6, 0.4)}[strategy]
    available = [
        (value, weight)
        for value, weight in zip((genre, text), weights, strict=True)
        if value is not None and weight > 0
    ]

    score = sum(value * weight for value, weight in available)
    shared_genres = sorted(set(left.genres) & set(right.genres)) if weights[0] else []
    contributions = {
        term: value * right.text.get(term, 0.0)
        for term, value in left.text.items()
        if text is not None and weights[1] and right.text.get(term, 0.0) > 0
    }
    return PairScore(
        score=score,
        genre_similarity=genre,
        text_similarity=text,
        shared_genres=shared_genres,
        shared_terms=sorted(contributions, key=lambda term: (-contributions[term], term))[:4],
    )


def preference_weight(signal: PreparedSignal) -> float:
    if signal.reaction == "disliked":
        return -1.0
    if signal.rating in (1, 2):
        return -1.0 if signal.rating == 1 else -0.5
    if signal.reaction == "liked" or signal.is_favorite:
        return 1.0
    return {None: 0.0, 3: 0.0, 4: 0.5, 5: 1.0}.get(signal.rating, 0.0)


class RecommendationReason(BaseModel):
    source_slug: str
    source_title: str
    shared_genres: list[str]
    shared_terms: list[str]
    description: str


class Recommendation(BaseModel):
    item: MediaItem
    score: float = Field(ge=0, le=1)
    positive_affinity: float
    negative_penalty: float
    reasons: list[RecommendationReason]


class RecommendationPage(BaseModel):
    model_version: str = MODEL_VERSION
    catalog_fingerprint: str | None = None
    strategy: Literal["genres", "text", "combined", "personalized"] = "combined"
    status: Literal["ready", "needs_tastes", "no_matches"]
    catalog_size: int = 0
    excluded_catalog_items: int = 0
    positive_signals: int = 0
    negative_signals: int = 0
    total: int = 0
    offset: int = 0
    has_more: bool = False
    items: list[Recommendation] = Field(default_factory=list)


def recommend(
    index: CatalogIndex,
    library: LibraryPreparation,
    limit: int = 12,
    media_type: MediaType | None = None,
    strategy: Strategy = "combined",
) -> RecommendationPage:
    by_slug = {row.item.slug: row for row in library.items if row.valid and row.identity_key}
    sources: list[tuple[PreparedSignal, float, ItemVector]] = []
    for signal in library.signals:
        row = by_slug.get(signal.media_key)
        weight = preference_weight(signal)
        if row and weight:
            source = index.items.get(signal.identity_key) or index.vector(row)
            sources.append((signal, weight, source))
    positives = [source for source in sources if source[1] > 0]
    negatives = [source for source in sources if source[1] < 0]
    page = RecommendationPage(
        status="needs_tastes" if not positives else "no_matches",
        catalog_size=index.total,
        catalog_fingerprint=index.fingerprint,
        excluded_catalog_items=index.excluded,
        strategy=strategy,
        positive_signals=len(positives),
        negative_signals=len(negatives),
    )
    if not positives:
        return page
    seen_keys = set(library.seen_keys) | {
        row.identity_key for row in library.items if row.identity_key
    }
    seen_ids = {row.item.id for row in library.items}
    seen_slugs = {row.item.slug for row in library.items}
    results: list[Recommendation] = []
    for key, candidate in index.items.items():
        item = candidate.prepared.item
        if key in seen_keys or item.id in seen_ids or item.slug in seen_slugs:
            continue
        if media_type is not None and item.media_type != media_type:
            continue
        support = [
            (signal, weight, compare(vector, candidate, strategy))
            for signal, weight, vector in positives
        ]
        positive = sum(weight * pair.score for _, weight, pair in support) / sum(
            weight for _, weight, _ in support
        )
        negative = (
            sum(
                abs(weight) * compare(vector, candidate, strategy).score
                for _, weight, vector in negatives
            )
            / sum(abs(weight) for _, weight, _ in negatives)
            if negatives
            else 0.0
        )
        penalty = 0.5 * negative
        score = positive - penalty
        support.sort(key=lambda entry: (-entry[1] * entry[2].score, entry[0].identity_key))
        evidence = [
            (signal, pair)
            for signal, _, pair in support
            if pair.score >= 0.1 and (pair.shared_genres or pair.shared_terms)
        ]
        if score <= 0.01 or not evidence:
            continue
        reasons: list[RecommendationReason] = []
        for signal, pair in evidence[:2]:
            title = by_slug[signal.media_key].item.title
            intro = (
                f"Você marcou “{title}” como favorito."
                if signal.is_favorite
                else f"Você marcou que gostou de “{title}”."
                if signal.reaction == "liked"
                else f"Você deu {signal.rating} estrelas a “{title}”."
            )
            labels = [GENRE_LABELS[genre] for genre in pair.shared_genres[:3]]
            detail = (
                f" Tem {', '.join(labels)} em comum."
                if labels
                else f" As descrições compartilham {', '.join(pair.shared_terms[:3])}."
            )
            reasons.append(
                RecommendationReason(
                    source_slug=signal.media_key,
                    source_title=title,
                    shared_genres=pair.shared_genres,
                    shared_terms=pair.shared_terms,
                    description=intro + detail,
                )
            )
        results.append(
            Recommendation(
                item=item,
                score=min(1.0, score),
                positive_affinity=positive,
                negative_penalty=penalty,
                reasons=reasons,
            )
        )
    results.sort(key=lambda row: (-row.score, row.item.slug))
    page.total = len(results)
    page.items = results[:limit]
    page.status = "ready" if results else "no_matches"
    return page


class RecommendationService:
    def __init__(self, catalog: Catalog) -> None:
        self.catalog = catalog
        self.index: CatalogIndex | None = None
        self.expires = 0.0
        self.lock = threading.Lock()

    def get_index(self) -> CatalogIndex:
        with self.lock:
            if self.index is None or time.monotonic() >= self.expires:
                self.index = CatalogIndex(read_catalog(self.catalog, maximum=2000))
                self.expires = time.monotonic() + 120
            return self.index

    def get(
        self,
        library: LibraryPreparation,
        limit: int,
        media_type: MediaType | None,
        strategy: Strategy,
    ) -> RecommendationPage:
        if not any(preference_weight(signal) > 0 for signal in library.signals):
            return RecommendationPage(status="needs_tastes", strategy=strategy)
        return recommend(self.get_index(), library, limit, media_type, strategy)
