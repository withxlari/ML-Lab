import argparse
import json
import math
import re
import unicodedata
from collections import Counter
from collections.abc import Sequence
from pathlib import Path

from pydantic import BaseModel

from app.data_quality import TAXONOMY_VERSION, CatalogPreparation
from app.genre_experiment import cosine_similarity

PORTUGUESE_STOPWORDS = frozenset(
    "a ao aos as com da das de delas deles do dos e ela ele em entre essa esse esta este "
    "isso isto la lhe lhes mais mas na nas no nos numa num o os ou outro outra outros outras "
    "para pela pelas pelo pelos por quando que se seu seus sua suas um uma umas uns".split()
)


def tokenize(text: str) -> list[str]:
    normalized = unicodedata.normalize("NFC", text).casefold()
    words = re.findall(r"[^\W\d_]+", normalized, flags=re.UNICODE)
    return [word for word in words if len(word) >= 2 and word not in PORTUGUESE_STOPWORDS]


class TfidfModel(BaseModel):
    document_count: int
    vocabulary: list[str]
    document_frequency: list[int]
    idf: list[float]


def fit_tfidf(documents: Sequence[str]) -> TfidfModel:
    if not documents:
        raise ValueError("É preciso fornecer pelo menos um texto para ajustar o vocabulário.")

    document_words = [set(tokenize(text)) for text in documents]
    vocabulary = sorted({word for words in document_words for word in words})
    frequency = [sum(word in words for words in document_words) for word in vocabulary]
    return TfidfModel(
        document_count=len(documents),
        vocabulary=vocabulary,
        document_frequency=frequency,
        idf=[math.log(len(documents) / df) for df in frequency],
    )


def transform_tfidf(model: TfidfModel, text: str) -> list[float]:

    counts = Counter(tokenize(text))
    return [counts[word] * weight for word, weight in zip(model.vocabulary, model.idf, strict=True)]


class TermWeight(BaseModel):
    word: str
    count: int
    document_frequency: int
    idf: float
    tfidf: float


class TextExample(BaseModel):
    slug: str
    title: str
    description: str
    tokens: list[str]
    vector: list[float]
    top_terms: list[TermWeight]
    shared_terms: list[str]
    similarity: float | None


class TextExperiment(BaseModel):
    method: str = "raw TF * ln(N/df), without smoothing; cosine similarity"
    scope: str = "Selected public descriptions; Portuguese stopwords; no personal preferences."
    model: TfidfModel
    reference: TextExample
    comparisons: list[TextExample]


def compare_descriptions(
    catalog: CatalogPreparation, reference: str, comparisons: list[str]
) -> TextExperiment:
    if catalog.schema_version != 1 or catalog.taxonomy_version != TAXONOMY_VERSION:
        raise ValueError("Versão da base incompatível com este experimento.")
    slugs = [reference, *comparisons]
    if len(set(slugs)) != len(slugs):
        raise ValueError("Escolha obras diferentes, sem repetições.")
    by_slug = {row.item.slug: row for row in catalog.items if row.valid}
    if any(slug not in by_slug for slug in slugs):
        raise ValueError("Uma das obras não está na base válida preparada.")
    selected = [by_slug[slug] for slug in slugs]
    if any(not row.description_text for row in selected):
        raise ValueError("Todas as obras selecionadas precisam ter sinopse.")
    descriptions = [row.description_text or "" for row in selected]
    model = fit_tfidf(descriptions)
    vectors = [transform_tfidf(model, text) for text in descriptions]
    examples: list[TextExample] = []
    for row, text, vector in zip(selected, descriptions, vectors, strict=True):
        tokens = tokenize(text)
        counts = Counter(tokens)
        terms = [
            TermWeight(word=word, count=counts[word], document_frequency=df, idf=idf, tfidf=value)
            for word, df, idf, value in zip(
                model.vocabulary, model.document_frequency, model.idf, vector, strict=True
            )
            if value > 0
        ]
        examples.append(
            TextExample(
                slug=row.item.slug,
                title=row.item.title,
                description=text,
                tokens=tokens,
                vector=vector,
                top_terms=sorted(terms, key=lambda term: (-term.tfidf, term.word))[:8],
                shared_terms=[
                    word
                    for word, a, b in zip(model.vocabulary, vectors[0], vector, strict=True)
                    if a > 0 and b > 0
                ],
                similarity=cosine_similarity(vectors[0], vector),
            )
        )
    return TextExperiment(model=model, reference=examples[0], comparisons=examples[1:])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--reference", default="interstellar")
    parser.add_argument("--compare", nargs="+", default=["severance", "budapest"])
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        catalog = CatalogPreparation.model_validate_json(args.catalog.read_text(encoding="utf-8"))
        result = compare_descriptions(catalog, args.reference, args.compare)
    except (OSError, ValueError):
        parser.exit(1, "Confira a base preparada, os identificadores e as sinopses escolhidas.\n")
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(result.model_dump_json(indent=2), encoding="utf-8")
    print(
        json.dumps(
            {
                "documents": result.model.document_count,
                "vocabulary_size": len(result.model.vocabulary),
                "reference": result.reference.title,
                "reference_terms": [term.word for term in result.reference.top_terms],
                "comparisons": [
                    {
                        "title": row.title,
                        "similarity": row.similarity,
                        "shared_terms": row.shared_terms,
                    }
                    for row in result.comparisons
                ],
            },
            ensure_ascii=True,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
