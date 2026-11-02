"""ISBN normalization used everywhere a book identity is built.

Every ISBN is stored and used for ids/slugs as ISBN-13. ISBN-10 values are validated
(mod 11, weights 10..1) and converted (prefix 978, mod-10 check digit recomputed).
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from uuid import NAMESPACE_URL, UUID, uuid5


def _check13(stem: str) -> str:
    return str((-sum(int(c) * (1 if i % 2 == 0 else 3) for i, c in enumerate(stem))) % 10)


def normalize_isbn(value: object) -> str | None:
    """Return the ISBN-13 for a valid ISBN-10/13 in any common spelling, else None."""
    if not isinstance(value, str):
        return None
    digits = re.sub(r"[^0-9Xx]", "", value).upper()
    if len(digits) == 10 and re.fullmatch(r"[0-9]{9}[0-9X]", digits):
        total = sum(int(c) * (10 - i) for i, c in enumerate(digits[:9]))
        total += 10 if digits[-1] == "X" else int(digits[-1])
        if total % 11:
            return None
        stem = "978" + digits[:9]
        return stem + _check13(stem)
    if re.fullmatch(r"97[89][0-9]{10}", digits) and _check13(digits[:12]) == digits[-1]:
        return digits
    return None


def first_isbn(values: Iterable[object]) -> str | None:
    """First valid ISBN, preferring values that are already ISBN-13."""
    candidates = [value for value in values if isinstance(value, str)]
    for value in candidates:
        if len(re.sub(r"[^0-9Xx]", "", value)) == 13 and (number := normalize_isbn(value)):
            return number
    return next((number for value in candidates if (number := normalize_isbn(value))), None)


def book_slug(number: str) -> str:
    return "book-isbn-" + number


def book_id(number: str) -> UUID:
    return uuid5(NAMESPACE_URL, "https://nexo.local/book/isbn/" + number)
