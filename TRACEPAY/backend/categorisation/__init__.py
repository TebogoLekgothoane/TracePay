"""Deterministic transaction categorisation."""

from .classifier import classify_transaction, normalize_description
from .models import CategorisationResult

__all__ = ["CategorisationResult", "classify_transaction", "normalize_description"]
