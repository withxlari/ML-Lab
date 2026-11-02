import math

import pytest

from app.catalog import Catalog, MediaItem
from app.core.config import Settings
from app.data_quality import prepare_catalog
from app.genre_experiment import cosine_similarity
from app.text_experiment import compare_descriptions, fit_tfidf, tokenize, transform_tfidf


def test_tokenization_is_explicit_and_does_not_invent_synonyms_or_stems() -> None:
    assert tokenize("UMA Missão, no ESPAÇO! Não. Memória memórias.") == [
        "missão",
        "espaço",
        "não",
        "memória",
        "memórias",
    ]
    assert tokenize("memo\u0301rias") == ["memórias"]


def test_idf_and_cosine_reproduce_the_hand_calculated_example() -> None:
    documents = ["missão espaço planeta", "família cidade", "missão espaço"]
    model = fit_tfidf(documents)
    assert model.idf[model.vocabulary.index("planeta")] == pytest.approx(math.log(3))
    assert model.idf[model.vocabulary.index("espaço")] == pytest.approx(math.log(3 / 2))
    vectors = [transform_tfidf(model, text) for text in documents]
    assert cosine_similarity(vectors[0], vectors[2]) == pytest.approx(0.46270886225222435)
    assert cosine_similarity(vectors[0], vectors[1]) == 0


def test_term_frequency_counts_repetitions_but_document_frequency_does_not() -> None:
    model = fit_tfidf(["espaço espaço planeta", "família cidade"])
    index = model.vocabulary.index("espaço")
    assert model.document_frequency[index] == 1
    assert transform_tfidf(model, "espaço espaço planeta")[index] == pytest.approx(2 * math.log(2))


def test_transform_preserves_fitted_weights_and_ignores_unknown_words() -> None:
    model = fit_tfidf(["espaço planeta", "família cidade"])
    before = model.model_dump()
    vector = transform_tfidf(model, "espaço palavra_desconhecida")
    assert model.model_dump() == before
    assert len(vector) == len(model.vocabulary)
    assert sum(value > 0 for value in vector) == 1


def test_ubiquitous_terms_or_empty_filtered_text_do_not_create_false_scores() -> None:
    model = fit_tfidf(["espaço planeta", "espaço planeta"])
    assert model.idf == [0, 0]
    vector = transform_tfidf(model, "espaço planeta")
    assert cosine_similarity(vector, vector) is None
    assert fit_tfidf(["a de uma"]).vocabulary == []
    with pytest.raises(ValueError):
        fit_tfidf([])


def test_real_descriptions_remain_unchanged_and_the_scope_is_only_three_works() -> None:
    prepared = prepare_catalog(Catalog(Settings(_env_file=None, catalog_source="local")).items())
    before = prepared.model_dump()
    result = compare_descriptions(prepared, "interstellar", ["severance", "budapest"])
    assert result.model.document_count == 3
    assert result.comparisons[0].similarity == 0
    assert result.comparisons[1].similarity == 0
    assert result.reference.tokens
    assert prepared.model_dump() == before


def test_missing_descriptions_and_repeated_examples_are_refused() -> None:
    items = Catalog(Settings(_env_file=None, catalog_source="local")).items()
    prepared = prepare_catalog(items)
    with pytest.raises(ValueError):
        compare_descriptions(prepared, "interstellar", ["interstellar"])
    without_description = MediaItem.model_validate({**items[0].model_dump(), "description": None})
    with pytest.raises(ValueError):
        compare_descriptions(
            prepare_catalog([without_description, items[1]]),
            without_description.slug,
            [items[1].slug],
        )
