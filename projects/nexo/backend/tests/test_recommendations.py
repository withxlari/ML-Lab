from unittest.mock import patch
from uuid import NAMESPACE_URL, uuid5

import pytest

from app.account import LibraryFeedback
from app.catalog import Catalog, MediaItem
from app.core.config import Settings
from app.data_quality import LibraryPreparation, PreparedSignal, prepare_catalog, prepare_library
from app.recommendations import (
    CatalogIndex,
    RecommendationService,
    TextSpace,
    compare,
    language_hint,
    preference_weight,
    recommend,
)

SPACE = "Uma missão no espaço leva um grupo para um planeta com uma estação e seus astronautas."
FAMILY = "Uma família vive na cidade com um filho e uma filha que procuram sua casa."


def media(
    slug: str, genres: list[str], description: str | None = SPACE, kind: str = "movie"
) -> MediaItem:
    return MediaItem.model_validate(
        {
            "id": str(uuid5(NAMESPACE_URL, slug)),
            "slug": slug,
            "title": slug,
            "media_type": kind,
            "source_url": f"https://example.invalid/{slug}",
            "genres": genres,
            "description": description,
        }
    )


def profile(
    items: list[MediaItem], ratings: list[int | None], favorites: list[bool] | None = None
) -> LibraryPreparation:
    return prepare_library(
        items,
        [
            LibraryFeedback(
                media_key=item.slug,
                rating=rating,
                is_favorite=(favorites or [False] * len(items))[i],
                status="planned",
            )
            for i, (item, rating) in enumerate(zip(items, ratings, strict=True))
        ],
    )


def test_completed_opinions_are_private_signals_without_synthetic_stars() -> None:
    item = Catalog(Settings(_env_file=None, catalog_source="local")).items()[0]
    for reaction, weight in (("liked", 1), ("disliked", -1), (None, 0)):
        library = prepare_library(
            [item],
            [
                LibraryFeedback.model_validate(
                    {
                        "media_key": item.slug,
                        "status": "completed",
                        "reaction": reaction,
                        "rating": None,
                        "is_favorite": False,
                    }
                )
            ],
        )
        assert library.rated_count == 0
        assert library.seen_keys
        assert (preference_weight(library.signals[0]) if library.signals else 0) == weight
    signal = PreparedSignal(
        identity_key="test",
        media_key=item.slug,
        rating=5,
        is_favorite=True,
        status="completed",
        reaction="disliked",
    )
    assert preference_weight(signal) == -1


def test_language_gate_is_conservative_and_never_translates() -> None:
    assert language_hint(SPACE) == "pt"
    assert (
        language_hint("The astronauts are in the station with their crew and they have a mission.")
        == "en"
    )
    assert language_hint("Une famille dans une ville cherche une maison.") is None
    assert language_hint("Space station") is None


def test_smoothing_preserves_identical_documents_and_transform_keeps_public_fit() -> None:
    model = TextSpace.fit([SPACE, SPACE], "pt")
    before = dict(model.idf)
    assert all(value == 1 for value in model.idf.values())
    vector = model.transform(SPACE, "pt")
    assert sum(value * value for value in vector.values()) == pytest.approx(1)
    model.transform("Uma nave exclusiva com um jardim particular.", "pt")
    assert model.idf == before


def test_text_and_genres_combine_with_explicit_fixed_weights() -> None:
    first, second = media("first", ["Drama"]), media("second", ["Drama"])
    index = CatalogIndex([first, second])
    a, b = list(index.items.values())
    result = compare(a, b)
    assert result.genre_similarity == pytest.approx(1)
    assert result.text_similarity == pytest.approx(1)
    assert result.score == pytest.approx(1)
    assert result.shared_terms


def test_missing_text_does_not_artificially_increase_score() -> None:
    a, b = media("first", ["Drama"]), media("second", ["Drama"], None)
    index = CatalogIndex([a, b])
    a_vector, b_vector = list(index.items.values())
    result = compare(a_vector, b_vector)
    assert result.score == pytest.approx(0.6)
    assert result.text_similarity is None
    assert not result.shared_terms


@pytest.mark.parametrize(
    ("rating", "favorite", "expected"),
    [
        (1, True, -1),
        (2, False, -0.5),
        (3, False, 0),
        (3, True, 1),
        (4, False, 0.5),
        (5, True, 1),
        (None, True, 1),
    ],
)
def test_rating_rules_and_favorites_are_not_double_counted(
    rating: int | None, favorite: bool, expected: float
) -> None:
    signal = PreparedSignal(
        identity_key="test", media_key="test", rating=rating, is_favorite=favorite, status="planned"
    )
    assert preference_weight(signal) == expected


def test_known_titles_are_excluded_and_explanations_have_real_evidence() -> None:
    seed = media("liked", ["Ficção científica"])
    candidate = media("candidate", ["Ficção científica"])
    unrelated = media("unrelated", ["Comédia"], FAMILY)
    index = CatalogIndex([seed, candidate, unrelated])
    result = recommend(index, profile([seed], [5]))
    assert result.status == "ready"
    assert result.items[0].item.slug == "candidate"
    assert "liked" not in [row.item.slug for row in result.items]
    assert result.items[0].reasons[0].shared_genres == ["science_fiction"]
    assert "5 estrelas" in result.items[0].reasons[0].description
    assert "ficção científica" in result.items[0].reasons[0].description


def test_liked_opinion_explains_a_recommendation_without_claiming_a_star_rating() -> None:
    seed = media("liked", ["Ficção científica"])
    candidate = media("candidate", ["Ficção científica"])
    library = prepare_library(
        [seed],
        [
            LibraryFeedback(
                media_key=seed.slug,
                status="completed",
                rating=None,
                is_favorite=False,
                reaction="liked",
            )
        ],
    )
    result = recommend(CatalogIndex([seed, candidate]), library)
    assert result.items[0].item.slug == "candidate"
    reason = result.items[0].reasons[0].description
    assert "gostou" in reason
    assert "estrelas" not in reason


def test_an_external_favorite_uses_frozen_catalog_space_and_can_find_candidates() -> None:
    candidate = media("candidate", ["Fantasia"])
    external = media("external-book", ["Fantasy"], kind="book")
    index = CatalogIndex([candidate])
    before = dict(index.spaces["pt"].idf)
    result = recommend(index, profile([external], [None], [True]))
    assert result.items[0].item.slug == "candidate"
    assert index.spaces["pt"].idf == before
    assert len(index.items) == 1


def test_low_ratings_reduce_candidate_affinity() -> None:
    liked = media("liked", ["Drama"])
    disliked = media("disliked", ["Drama", "Terror"], FAMILY)
    candidate = media("candidate", ["Drama", "Terror"], FAMILY)
    index = CatalogIndex([liked, disliked, candidate])
    without = recommend(index, profile([liked], [5]), strategy="genres")
    with_negative = recommend(index, profile([liked, disliked], [5, 1]), strategy="genres")
    score_before = next(row.score for row in without.items if row.item.slug == "candidate")
    score_after = next(
        (row.score for row in with_negative.items if row.item.slug == "candidate"), 0
    )
    assert score_after < score_before


@pytest.mark.parametrize("rating", [None, 1, 2, 3])
def test_saving_completed_or_neutral_titles_does_not_invent_positive_tastes(
    rating: int | None,
) -> None:
    seed = media("seed", ["Drama"])
    result = recommend(CatalogIndex([seed]), profile([seed], [rating]))
    assert result.status == "needs_tastes" and not result.items


def test_all_five_categories_and_filters_use_the_same_canonical_identity() -> None:
    seed = media("liked", ["Fantasia"])
    candidates = [
        media(f"candidate-{kind}", ["Fantasy"], kind=kind)
        for kind in ("movie", "series", "book", "manga", "game")
    ]
    index = CatalogIndex([seed, *candidates])
    library = profile([seed], [5])
    assert len(recommend(index, library).items) == 5
    assert {row.item.media_type for row in recommend(index, library, media_type="game").items} == {
        "game"
    }


def test_different_languages_do_not_create_lexical_explanations() -> None:
    pt = media("pt", ["Drama"])
    en = media(
        "en",
        ["Drama"],
        "The astronauts are in the station with their crew and they have a mission.",
    )
    index = CatalogIndex([pt, en])
    pt_vector, en_vector = list(index.items.values())
    pair = compare(pt_vector, en_vector)
    assert pair.text_similarity is None and not pair.shared_terms
    assert pair.score == pytest.approx(0.6)


def test_disjoint_features_return_no_matches_instead_of_fake_popularity() -> None:
    seed = media("seed", ["Drama"], None)
    candidate = media("candidate", ["Comédia"], None)
    assert recommend(CatalogIndex([seed, candidate]), profile([seed], [5])).status == "no_matches"


def test_public_cache_is_reused_without_storing_personal_results() -> None:
    items = [media("seed", ["Drama"]), media("candidate", ["Drama"])]
    store = RecommendationService(Catalog(Settings(_env_file=None, catalog_source="local")))
    with patch("app.recommendations.read_catalog", return_value=items) as load:
        first = store.get(profile([items[0]], [5]), 12, None, "combined")
        second = store.get(profile([items[1]], [5]), 12, None, "combined")
    assert load.call_count == 1
    assert first.items[0].item.slug == "candidate"
    assert second.items[0].item.slug == "seed"
    assert all(
        row.prepared.item.slug in {"seed", "candidate"} for row in store.get_index().items.values()
    )


def test_invalid_duplicate_candidates_are_blocked() -> None:
    item = media("duplicate", ["Drama"])
    index = CatalogIndex([item, item])
    assert not index.items and index.excluded == 2
    assert prepare_catalog([item]).summary.valid == 1
