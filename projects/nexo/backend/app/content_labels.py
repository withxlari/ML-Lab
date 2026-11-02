import re
from collections.abc import Iterable


def explicit_game_metadata(labels: Iterable[str]) -> bool:

    return any(
        re.search(
            r"\b(?:nsfw|hentai|porn(?:ographic|ography)?|erotic|erotica|futa|futanari)\b"
            r"|\badults?\s*only\b|\b(?:explicit|strong) sexual\b|\bsexual content\b",
            label,
            re.IGNORECASE,
        )
        for label in labels
    )


def adult_rating(labels: Iterable[str]) -> bool:
    return any(
        re.search(r"\b18\b|\bAO\b|\badults?\s*only\b", label, re.IGNORECASE) for label in labels
    )
