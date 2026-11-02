from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

from app.account import AccountStore, AccountUser
from app.candidates import CandidatePool, media_identity
from app.catalog import MediaItem, MediaType, normalize
from app.community import CommunityStore, TastePreferences
from app.data_quality import GENRES, LibraryPreparation, prepare_item, read_catalog
from app.recommendations import (
    Recommendation,
    RecommendationPage,
    RecommendationReason,
    preference_weight,
)
from app.semantic import LocalEmbeddings, cosine


@dataclass
class Signal:
    item: MediaItem | None
    text: str
    weight: float
    category: MediaType | None = None
    label: str = "Seus gostos"


def document(item: MediaItem) -> str:
    return ". ".join([item.title, ", ".join(item.genres), (item.description or "")[:1400]])


def genre_keys(labels: list[str]) -> set[str]:
    return {GENRES.get(normalize(label), normalize(label)) for label in labels}


def rank(
    candidates: list[MediaItem],
    signals: list[Signal],
    excluded: set[str],
    tastes: TastePreferences,
    encoder: LocalEmbeddings,
    owner: str,
    limit: int = 12,
    media_type: MediaType | None = None,
    offset: int = 0,
) -> RecommendationPage:
    positive = [s for s in signals if s.weight > 0]
    page = RecommendationPage(
        model_version="semantic-v2",
        strategy="personalized",
        status="needs_tastes" if not positive else "no_matches",
        catalog_size=len(candidates),
        positive_signals=len(positive),
        negative_signals=sum(s.weight < 0 for s in signals),
    )
    if not positive:
        return page
    unique = {media_identity(item): item for item in candidates}
    eligible = []
    for key, item in unique.items():
        category = tastes.categories.get(item.media_type)
        if key in excluded or (media_type and item.media_type != media_type):
            continue
        if category and genre_keys(category.avoided_genres) & genre_keys(item.genres):
            continue
        eligible.append(item)
    if not eligible:
        return page
    vectors = encoder.encode([document(item) for item in eligible])
    private = encoder.encode([s.text for s in signals], owner=owner)
    scored: list[tuple[Recommendation, list[float]]] = []
    for item, vector in zip(eligible, vectors, strict=True):
        support: list[tuple[float, Signal, float]] = []
        penalty = 0.0
        for signal, source_vector in zip(signals, private, strict=True):
            if signal.category and signal.category != item.media_type:
                continue
            semantic = cosine(vector, source_vector)

            source_genres = genre_keys(signal.item.genres) if signal.item else set()
            target_genres = genre_keys(item.genres)
            overlap = len(source_genres & target_genres) / max(
                1, len(source_genres | target_genres)
            )
            affinity = 0.78 * semantic + 0.22 * overlap if source_genres else semantic
            if signal.weight > 0:
                support.append((affinity * min(signal.weight, 1.5), signal, semantic))
            else:
                penalty = max(penalty, affinity * abs(signal.weight))
        if not support:
            continue
        support.sort(key=lambda row: row[0], reverse=True)
        best, source, similarity = support[0]
        affinity = best * 0.8 + sum(v[0] for v in support[:3]) / min(3, len(support)) * 0.2
        score = max(0.0, min(1.0, affinity - 0.55 * penalty))
        if score < 0.16 or similarity < 0.23:
            continue
        shared = sorted(set(item.genres) & set(source.item.genres)) if source.item else []
        reason = (
            f"A partir de {source.item.title}: "
            if source.item
            else "Pelos gostos que você descreveu: "
        )
        reason += (
            "gêneros em comum e informações próximas em sentido."
            if shared
            else "informações próximas em sentido."
        )
        scored.append(
            (
                Recommendation(
                    item=item,
                    score=round(score, 5),
                    positive_affinity=affinity,
                    negative_penalty=penalty,
                    reasons=[
                        RecommendationReason(
                            source_slug=source.item.slug if source.item else "preferences",
                            source_title=source.label,
                            shared_genres=shared,
                            shared_terms=[],
                            description=reason,
                        )
                    ],
                ),
                vector,
            )
        )
    page.total = len(scored)

    page.offset = offset if 0 <= offset < page.total else 0
    target = min(page.offset + limit, page.total)
    selected: list[tuple[Recommendation, list[float]]] = []
    counts: dict[MediaType, int] = {}
    max_similarity = {id(row): 0.0 for row in scored}

    while scored and len(selected) < target:
        if len(selected) % limit == 0:
            counts.clear()
        allowed = [r for r in scored if media_type or counts.get(r[0].item.media_type, 0) < 3]
        options = allowed or scored
        chosen = max(
            options,
            key=lambda r: r[0].score - 0.18 * max_similarity[id(r)],
        )
        selected.append(chosen)
        scored.remove(chosen)
        counts[chosen[0].item.media_type] = counts.get(chosen[0].item.media_type, 0) + 1
        if len(selected) < target:
            for row in scored:
                latest = cosine(row[1], chosen[1])
                max_similarity[id(row)] = (
                    latest if len(selected) == 1 else max(max_similarity[id(row)], latest)
                )
    page.items = [row[0] for row in selected[page.offset :]]
    page.has_more = page.offset + len(page.items) < page.total
    page.status = "ready" if page.items else "no_matches"
    return page


class PersonalizationService:
    def __init__(self, account: AccountStore, pool: CandidatePool) -> None:
        self.account = account
        self.community = CommunityStore(account)
        self.pool = pool
        self.encoder = LocalEmbeddings()

    def get(
        self,
        user: AccountUser,
        token: str,
        library: LibraryPreparation,
        limit: int,
        media_type: MediaType | None,
        offset: int = 0,
    ) -> RecommendationPage:
        with ThreadPoolExecutor(max_workers=4) as executor:
            taste_task = executor.submit(self.community.preferences, user, token)
            profile_task = executor.submit(self.community.own_profile, user, token)
            review_task = executor.submit(self.community.reviews, user, token)
            feedback_task = executor.submit(self.community.feedback, user, token)
            tastes, profile = taste_task.result(), profile_task.result()
            reviews, feedback = review_task.result(), feedback_task.result()
        signals: list[Signal] = []
        excluded = {media_identity(row.item) for row in library.items}
        by_slug = {row.item.slug: row.item for row in library.items if row.valid}
        ratings = {s.media_key: s.rating for s in library.signals}
        weights = {s.media_key: preference_weight(s) for s in library.signals}
        if profile:
            for items in profile.top_fives.values():
                for position, item in enumerate(items):
                    by_slug[item.slug] = item
                    excluded.add(media_identity(item))
                    if ratings.get(item.slug) not in {1, 2} and weights.get(item.slug, 0) >= 0:
                        weights[item.slug] = max(weights.get(item.slug, 0), 1.5 - position * 0.1)
        for slug, item in by_slug.items():
            weight = weights.get(slug, 0)
            if weight:
                signals.append(Signal(item, document(item), weight, label=item.title))
        for review in reviews:
            excluded.add(media_identity(review.item))
            if weights.get(review.media_key, 0) < 0 and review.rating in {4, 5}:
                continue
            if review.rating in {1, 2, 4, 5}:
                weight = 1.0 if review.rating >= 4 else -1.0
                signals.append(
                    Signal(review.item, review.body, weight * 0.8, label=review.item.title)
                )
        for entry in feedback:
            excluded.add(media_identity(entry.item))
            if entry.action != "already_known":
                signals.append(
                    Signal(
                        entry.item,
                        document(entry.item),
                        0.8 if entry.action == "more_like_this" else -1,
                        label=entry.item.title,
                    )
                )
        for category, taste in tastes.categories.items():
            for labels, weight in (
                (taste.liked_genres + taste.liked_themes, 1),
                (taste.avoided_genres + taste.avoided_themes, -1),
            ):
                if labels:
                    signals.append(Signal(None, ". ".join(labels), weight, category))
        for text, weight in ((tastes.like_text, 1), (tastes.avoid_text, -1)):
            if text:
                signals.append(Signal(None, text, weight))
        sources = [
            s.item
            for s in sorted(signals, key=lambda s: s.weight, reverse=True)
            if s.item and s.weight > 0
        ][:2]
        with ThreadPoolExecutor(max_workers=2) as executor:
            list(executor.map(self.pool.related, sources))
        with self.pool.lock:
            corpus = dict(self.pool.items)
        for item in self.pool.search.metadata.works():
            corpus[media_identity(item)] = item
        for item in read_catalog(self.account.catalog, maximum=2000):
            corpus[media_identity(item)] = item
        valid = [item for item in corpus.values() if prepare_item(item).valid]
        return rank(
            valid, signals, excluded, tastes, self.encoder, str(user.id), limit, media_type, offset
        )
