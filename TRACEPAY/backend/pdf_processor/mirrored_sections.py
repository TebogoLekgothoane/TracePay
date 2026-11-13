"""Some statements print every transaction twice.

Investec Private Bank statements list the full month under "Transaction detail",
then repeat the same rows again grouped by type ("Online payments, deposits, fees
and interest") and by card holder ("Card transactions"). Reading both sections
doubles every amount, so only the main section is kept.
"""

from __future__ import annotations

import re

_MAIN_SECTION = re.compile(r"transaction detail", re.IGNORECASE)
_MIRROR_SECTIONS = (
    re.compile(r"online payments,\s*deposits,\s*fees\s*and\s*interest", re.IGNORECASE),
    re.compile(r"^\s*card transactions\b", re.IGNORECASE | re.MULTILINE),
)


def _first_mirror_start(text: str) -> int | None:
    main = _MAIN_SECTION.search(text)
    if not main:
        return None
    starts = [
        match.start()
        for pattern in _MIRROR_SECTIONS
        if (match := pattern.search(text, main.end()))
    ]
    return min(starts) if starts else None


def has_mirrored_sections(text: str) -> bool:
    return _first_mirror_start(text) is not None


def drop_mirrored_text(text: str) -> str:
    """Return the statement text without the repeated summary sections."""
    start = _first_mirror_start(text)
    return text if start is None else text[:start]


def is_mirror_table(headers: list[str]) -> bool:
    """The repeated sections have no running balance and a separate fees column."""
    joined = " ".join(str(header).casefold() for header in headers)
    return "fees" in joined and "balance" not in joined
