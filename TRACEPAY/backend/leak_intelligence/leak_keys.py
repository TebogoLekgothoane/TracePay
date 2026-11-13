"""Stable identity utilities for non-persisted and future persisted leak findings."""

from __future__ import annotations

import hashlib
import re


def leak_fingerprint(
    *,
    user_id: str,
    leak_type: str,
    subject_key: str,
    detector_version: str,
) -> str:
    """Return a stable key independent of execution time or volatile evidence."""
    subject = _slug(subject_key)
    value = "|".join(
        (user_id, leak_type, subject, detector_version)
    )
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:32]


def subject_key(value: str) -> str:
    """Normalize a category or merchant key without retaining raw descriptions."""
    return _slug(value)


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:120] or "overall"
