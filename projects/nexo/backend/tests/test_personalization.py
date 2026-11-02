from pathlib import Path
from typing import cast
from unittest.mock import MagicMock
from uuid import NAMESPACE_URL, uuid5

import pytest

from app.candidates import media_identity
from app.catalog import MediaItem
from app.community import CategoryTaste, PublicProfileUpdate, TastePreferences
from app.personalization import Signal, rank
from app.recommendations import RecommendationPage
from app.semantic import LocalEmbeddings, chunks, cosine, normalized


def item(slug: str, description: str, genre: str = "Drama") -> MediaItem:
    return MediaItem(
        id=uuid5(NAMESPACE_URL, slug),
        slug=slug,
        title=slug,
        media_type="movie",
        description=description,
        genres=[genre],
        source_url=f"https://example.invalid/{slug}",
    )


def encoder() -> LocalEmbeddings:
    model = MagicMock()

    def encode(texts: list[str], owner: str | None = None) -> list[list[float]]:
        return [
            normalized([1.0, 0.05]) if "space" in text else normalized([0.05, 1.0])
            for text in texts
        ]

    model.encode.side_effect = encode
    return cast(LocalEmbeddings, model)


def test_semantics_filters_avoided_genres_and_excludes_known_without_duplicate_sources() -> None:
    space = item("space", "space journey")
    other = item("other", "family story")
    blocked = item("blocked", "space terror", "Terror")
    known = item("known", "space drama")
    duplicate = space.model_copy(update={"slug": "alternate", "title": "alternate"})
    tastes = TastePreferences(categories={"movie": CategoryTaste(avoided_genres=["horror"])})
    page = rank(
        [space, other, blocked, known, duplicate],
        [Signal(None, "space", 1)],
        {media_identity(known)},
        tastes,
        encoder(),
        "owner",
    )
    assert [r.item.slug for r in page.items] == ["alternate"]
    assert page.items[0].reasons[0].source_slug == "preferences"


def test_negative_signal_reduces_affinity_and_category_preferences_do_not_leak() -> None:
    space = item("space", "space journey")
    a = rank([space], [Signal(None, "space", 1)], set(), TastePreferences(), encoder(), "a")
    b = rank(
        [space],
        [Signal(None, "space", 1), Signal(None, "space", -1)],
        set(),
        TastePreferences(),
        encoder(),
        "b",
    )
    assert b.items[0].score < a.items[0].score
    restricted = rank(
        [space], [Signal(None, "space", 1, "book")], set(), TastePreferences(), encoder(), "b"
    )
    assert restricted.status == "no_matches"
    assert not restricted.items


def test_refresh_pages_are_disjoint_keep_exclusions_and_wrap_when_pool_shrinks() -> None:
    candidates = [item(f"space-{i}", "space journey") for i in range(8)]
    candidates += [item("irrelevant", "family story"), item("blocked", "space", "Terror")]
    tastes = TastePreferences(categories={"movie": CategoryTaste(avoided_genres=["horror"])})
    excluded = {media_identity(candidates[0])}

    def batch(offset: int) -> RecommendationPage:
        return rank(
            candidates,
            [Signal(None, "space", 1)],
            excluded,
            tastes,
            encoder(),
            "owner",
            limit=3,
            media_type="movie",
            offset=offset,
        )

    first, second, last = [batch(offset) for offset in (0, 3, 6)]
    assert [p.total for p in (first, second, last)] == [7, 7, 7]
    assert [p.offset for p in (first, second, last)] == [0, 3, 6]
    assert [p.has_more for p in (first, second, last)] == [True, True, False]
    slugs = [row.item.slug for p in (first, second, last) for row in p.items]
    assert len(set(slugs)) == 7
    assert set(slugs) == {f"space-{i}" for i in range(1, 8)}
    assert batch(30).items == first.items
    assert batch(30).offset == 0
    assert batch(0).items == first.items


def test_pagination_keeps_category_variety_in_each_batch() -> None:
    candidates = [
        item(f"space-{category}-{i}", "space").model_copy(update={"media_type": category})
        for category in ("movie", "book", "game", "manga", "series")
        for i in range(6)
    ]
    pages = [
        rank(
            candidates,
            [Signal(None, "space", 1)],
            set(),
            TastePreferences(),
            encoder(),
            "owner",
            offset=offset,
        )
        for offset in (0, 12)
    ]
    assert not {r.item.slug for r in pages[0].items} & {r.item.slug for r in pages[1].items}
    for page in pages:
        assert len(page.items) == 12
        assert (
            max(
                sum(r.item.media_type == category for r in page.items)
                for category in ("movie", "book", "game", "manga", "series")
            )
            <= 3
        )


def test_neutral_and_negative_only_profiles_do_not_invent_positive_tastes() -> None:
    model = encoder()
    page = rank(
        [item("space", "space")],
        [Signal(None, "space", -1)],
        set(),
        TastePreferences(),
        model,
        "owner",
    )
    assert page.status == "needs_tastes"
    cast(MagicMock, model).encode.assert_not_called()


def test_long_reviews_keep_their_final_words_and_normalization_is_cosine() -> None:
    text = ("histórias de astronautas " * 100) + "FINAL_IMPORTANTE"
    parts = chunks(text)
    assert parts[-1].endswith("FINAL_IMPORTANTE")
    assert all(len(part) <= 240 for part in parts)
    assert cosine(normalized([3.0, 4.0]), normalized([3.0, 4.0])) == pytest.approx(1)


def test_private_embeddings_are_not_written_to_public_vector_cache(tmp_path: Path) -> None:
    model = LocalEmbeddings(tmp_path)
    model.model = MagicMock()
    model.model.embed.side_effect = lambda texts, **kwargs: [[1.0] * 384 for _ in texts]
    first = model.encode(["PRIVATE_SENTINEL"], owner="a")
    model.encode(["PRIVATE_SENTINEL"], owner="a")
    assert model.model.embed.call_count == 1
    model.encode(["PRIVATE_SENTINEL"], owner="b")
    assert model.model.embed.call_count == 2
    assert first[0] == model.encode(["PRIVATE_SENTINEL"], owner="b")[0]
    import sqlite3

    with sqlite3.connect(tmp_path / "semantic" / "public-vectors.sqlite3") as db:
        assert db.execute("select count(*) from vectors").fetchone()[0] == 0
    model.encode(["public description"])
    with sqlite3.connect(tmp_path / "semantic" / "public-vectors.sqlite3") as db:
        assert db.execute("select count(*) from vectors").fetchone()[0] == 1


def test_top_five_limits_and_taste_conflicts_are_validated() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        PublicProfileUpdate(username="tester", display_name="Tester", top_fives={"movie": [{}] * 6})
    with pytest.raises(ValidationError):
        CategoryTaste(liked_genres=["Terror"], avoided_genres=["terror"])


def test_service_keeps_low_ratings_negative_even_in_top_five_and_known_feedback_neutral() -> None:
    from datetime import UTC, datetime
    from unittest.mock import patch
    from uuid import uuid4

    from app.account import AccountStore, AccountUser, LibraryFeedback
    from app.catalog import Catalog
    from app.community import Feedback, PublicProfile
    from app.core.config import Settings
    from app.data_quality import prepare_library
    from app.personalization import PersonalizationService

    config = Settings(_env_file=None, catalog_source="local")
    account = AccountStore(config, Catalog(config))
    source, known = account.catalog.items()[:2]
    pool = MagicMock()
    pool.lock = __import__("threading").Lock()
    pool.items = {media_identity(known): known}
    service = PersonalizationService(account, pool)
    service.encoder = encoder()
    user = AccountUser(id=uuid4())
    library = prepare_library(
        [source],
        [LibraryFeedback(media_key=source.slug, rating=1, is_favorite=True, status="completed")],
    )
    public = PublicProfile(
        username="tester",
        display_name="Tester",
        bio="",
        is_public=False,
        show_ratings=False,
        top_fives={"movie": [source]},
        updated_at=datetime.now(UTC),
    )
    explicit = Feedback(
        media_key=known.slug, item=known, action="already_known", updated_at=datetime.now(UTC)
    )
    with (
        patch.object(service.community, "preferences", return_value=TastePreferences()),
        patch.object(service.community, "own_profile", return_value=public),
        patch.object(service.community, "reviews", return_value=[]),
        patch.object(service.community, "feedback", return_value=[explicit]),
    ):
        result = service.get(user, "owner-token", library, 12, None)
    assert result.status == "needs_tastes"
    assert result.positive_signals == 0
    assert result.negative_signals == 1
    pool.related.assert_not_called()
