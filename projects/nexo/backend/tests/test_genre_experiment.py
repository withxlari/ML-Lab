import math

import pytest

from app.catalog import Catalog
from app.core.config import Settings
from app.data_quality import prepare_catalog
from app.genre_experiment import compare_examples, cosine_similarity, genre_vector


def test_vectors_share_the_same_column_order_and_ignore_repeated_labels() -> None:
    assert genre_vector(["drama", "drama"], ["comedy", "drama", "science_fiction"]) == [0, 1, 0]


def test_cosine_matches_hand_calculations() -> None:
    assert cosine_similarity([1, 1, 0], [1, 1, 0]) == pytest.approx(1)
    assert cosine_similarity([1, 1, 0], [1, 0, 0]) == pytest.approx(1 / math.sqrt(2))
    assert cosine_similarity([1, 1, 0], [0, 0, 1]) == 0
    assert cosine_similarity([1, 1, 0, 0], [0, 1, 1, 0]) == pytest.approx(0.5)


def test_missing_genres_are_unknown_instead_of_zero_similarity() -> None:
    assert cosine_similarity([0, 0], [1, 0]) is None
    assert cosine_similarity([], []) is None


def test_invalid_vector_dimensions_and_numbers_are_rejected() -> None:
    with pytest.raises(ValueError):
        cosine_similarity([1], [1, 0])
    with pytest.raises(ValueError):
        cosine_similarity([float("nan")], [1])


def test_real_local_examples_are_comparable_and_original_records_are_unchanged() -> None:
    items = Catalog(Settings(_env_file=None, catalog_source="local")).items()
    prepared = prepare_catalog(items)
    before = prepared.model_dump()
    result = compare_examples(prepared, "interstellar", ["severance", "budapest"])
    assert result.comparisons[0].similarity == pytest.approx(0.5)
    assert result.comparisons[1].similarity == 0
    assert result.comparisons[0].shared_genres == ["science_fiction"]
    assert prepared.model_dump() == before


def test_experiment_refuses_missing_or_repeated_works() -> None:
    prepared = prepare_catalog(Catalog(Settings(_env_file=None, catalog_source="local")).items())
    with pytest.raises(ValueError):
        compare_examples(prepared, "interstellar", ["unknown"])
    with pytest.raises(ValueError):
        compare_examples(prepared, "interstellar", ["interstellar"])
