import argparse
import json
from pathlib import Path

from pydantic import BaseModel

from app.account import LibraryFeedback
from app.data_quality import CatalogPreparation, LibraryPreparation, prepare_library
from app.recommendations import CatalogIndex, Strategy, preference_weight, recommend


class Evaluation(BaseModel):
    strategy: Strategy
    k: int
    evaluated: int
    unavailable_targets: int
    skipped_without_other_positives: int
    hit_rate_at_k: float | None
    mrr_at_k: float | None
    ranks: list[int | None]


def leave_one_out(
    index: CatalogIndex, library: LibraryPreparation, strategy: Strategy, k: int = 5
) -> Evaluation:
    positives = [signal for signal in library.signals if preference_weight(signal) > 0]
    ranks: list[int | None] = []
    unavailable = skipped = 0
    for held_out in positives[:20]:
        if held_out.identity_key not in index.items:
            unavailable += 1
            continue
        others = [
            signal for signal in library.signals if signal.identity_key != held_out.identity_key
        ]
        if not any(preference_weight(signal) > 0 for signal in others):
            skipped += 1
            continue

        hidden = library.model_copy(
            update={
                "signals": others,
                "items": [
                    row for row in library.items if row.identity_key != held_out.identity_key
                ],
                "seen_keys": [key for key in library.seen_keys if key != held_out.identity_key],
            }
        )
        page = recommend(index, hidden, k, strategy=strategy)
        target = index.items[held_out.identity_key].prepared.item.id
        ranks.append(
            next(
                (position for position, row in enumerate(page.items, 1) if row.item.id == target),
                None,
            )
        )
    return Evaluation(
        strategy=strategy,
        k=k,
        evaluated=len(ranks),
        unavailable_targets=unavailable,
        skipped_without_other_positives=skipped,
        hit_rate_at_k=sum(rank is not None for rank in ranks) / len(ranks) if ranks else None,
        mrr_at_k=sum(1 / rank for rank in ranks if rank is not None) / len(ranks)
        if ranks
        else None,
        ranks=ranks,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    base = CatalogPreparation.model_validate_json(args.catalog.read_text(encoding="utf-8"))
    catalog = [row.item for row in base.items if row.valid]
    by_slug = {item.slug: item for item in catalog}
    index = CatalogIndex(catalog)
    groups = {
        "ficcao-cientifica": ["interstellar", "severance", "dark", "dune-book"],
        "jogos": [item.slug for item in catalog if item.media_type == "game"][:4],
    }
    evaluations = []
    for name, slugs in groups.items():
        items = [by_slug[slug] for slug in slugs if slug in by_slug]
        library = prepare_library(
            items,
            [
                LibraryFeedback(
                    media_key=item.slug, status="completed", rating=5, is_favorite=False
                )
                for item in items
            ],
        )
        strategies: tuple[Strategy, ...] = ("genres", "text", "combined")
        for strategy in strategies:
            evaluation = leave_one_out(index, library, strategy)
            evaluations.append({"fictional_profile": name, **evaluation.model_dump()})
    report = {
        "model_version": "content-v1",
        "catalog_fingerprint": index.fingerprint,
        "scope": (
            "Fictional public profiles. Exploratory leave-one-out; not measured user satisfaction."
        ),
        "weights_selected_before_evaluation": {"genres": 0.6, "text": 0.4, "negative_penalty": 0.5},
        "evaluations": evaluations,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
