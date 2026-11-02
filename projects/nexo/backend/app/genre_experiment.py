import argparse
import json
import math
from collections.abc import Sequence
from pathlib import Path

from pydantic import BaseModel

from app.data_quality import TAXONOMY_VERSION, CatalogPreparation, PreparedMedia


def genre_vector(genres: Sequence[str], vocabulary: Sequence[str]) -> list[int]:

    present = set(genres)
    return [1 if genre in present else 0 for genre in vocabulary]


def cosine_similarity(left: Sequence[float], right: Sequence[float]) -> float | None:
    if len(left) != len(right):
        raise ValueError("Os vetores precisam ter o mesmo número de colunas.")
    if not all(math.isfinite(value) for value in (*left, *right)):
        raise ValueError("Os vetores precisam conter números finitos.")

    dot_product = sum(a * b for a, b in zip(left, right, strict=True))

    denominator = math.sqrt(sum(a * a for a in left)) * math.sqrt(sum(b * b for b in right))
    if denominator == 0:
        return None
    return max(-1.0, min(1.0, dot_product / denominator))


class Example(BaseModel):
    slug: str
    title: str
    vector: list[int]
    shared_genres: list[str]
    similarity: float | None


class GenreExperiment(BaseModel):
    method: str = "binary genres + cosine; educational example, not personal recommendations"
    vocabulary: list[str]
    reference: Example
    comparisons: list[Example]


def compare_examples(
    catalog: CatalogPreparation, reference: str, comparisons: list[str]
) -> GenreExperiment:
    if catalog.schema_version != 1 or catalog.taxonomy_version != TAXONOMY_VERSION:
        raise ValueError("Versão da base incompatível com este experimento.")
    by_slug = {row.item.slug: row for row in catalog.items if row.valid}
    slugs = [reference, *comparisons]
    if len(set(slugs)) != len(slugs):
        raise ValueError("Escolha uma referência e comparações diferentes, sem repetir obras.")
    if any(slug not in by_slug for slug in slugs):
        raise ValueError("Uma das obras não está na base válida preparada.")
    selected = [by_slug[slug] for slug in slugs]
    vocabulary = sorted({genre for row in selected for genre in row.genre_keys})
    anchor = selected[0]
    anchor_vector = genre_vector(anchor.genre_keys, vocabulary)

    def example(row: PreparedMedia) -> Example:
        vector = genre_vector(row.genre_keys, vocabulary)
        return Example(
            slug=row.item.slug,
            title=row.item.title,
            vector=vector,
            shared_genres=sorted(set(anchor.genre_keys) & set(row.genre_keys)),
            similarity=cosine_similarity(anchor_vector, vector),
        )

    return GenreExperiment(
        vocabulary=vocabulary,
        reference=example(anchor),
        comparisons=[example(row) for row in selected[1:]],
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--reference", default="interstellar")
    parser.add_argument("--compare", nargs="+", default=["severance", "budapest"])
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        catalog = CatalogPreparation.model_validate_json(args.catalog.read_text(encoding="utf-8"))
        result = compare_examples(catalog, args.reference, args.compare)
    except (OSError, ValueError):
        parser.exit(1, "Confira a base preparada, sua versão e os identificadores das obras.\n")
    content = result.model_dump_json(indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(content, encoding="utf-8")

    print(json.dumps(result.model_dump(), ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
