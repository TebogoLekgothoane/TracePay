"""Categorisation may label a transaction; it can never rewrite what was extracted."""

from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from categorisation.models import CategorisationResult
from pdf_processor.main import _with_category
from pdf_processor.models import Transaction


def _extracted() -> Transaction:
    return Transaction(
        date=date(2026, 3, 1),
        description="  CARD PURCHASE  XYZZY 4471 ",
        amount=Decimal("-321.10"),
        type="debit",
        balance=Decimal("1000.00"),
        currency="ZAR",
        source_row=4,
        confidence="high",
        reference="REF-77",
        date_text="01 Mar",
        date_confidence="medium",
        date_warnings=["year_inferred_from_statement_period"],
        value_date=date(2026, 3, 3),
    )


def test_a_category_never_changes_date_amount_description_or_references() -> None:
    before = _extracted()
    after = _with_category(
        before,
        CategorisationResult(
            category_name="Groceries",
            category_confidence=0.9,
            transaction_class="spending",
            classification_confidence=0.9,
            merchant_name="Checkers",
            rule="ai:test",
        ),
        {"groceries": "Groceries"},
    )
    for field in (
        "date", "description", "amount", "type", "balance", "currency", "source_row",
        "reference", "date_text", "date_confidence", "date_warnings", "value_date",
    ):
        assert getattr(after, field) == getattr(before, field), field
    assert after.category_name == "Groceries"


def test_an_unknown_merchant_is_kept_unknown() -> None:
    after = _with_category(_extracted(), CategorisationResult(), {})
    assert after.category_name is None
    assert after.transaction_class == "unknown"
    assert after.date == date(2026, 3, 1) and after.amount == Decimal("-321.10")


def test_invented_classes_are_rejected_by_the_schema() -> None:
    with pytest.raises(ValidationError):
        CategorisationResult(transaction_class="definitely-a-leak")  # type: ignore[arg-type]
    with pytest.raises(ValidationError):
        CategorisationResult(category_confidence=7)


def test_a_transaction_cannot_be_given_an_impossible_date() -> None:
    with pytest.raises(ValidationError):
        Transaction(
            date="2026-02-30",  # type: ignore[arg-type]
            description="X", amount=Decimal("-1"), type="debit", source_row=1, confidence="high",
        )
