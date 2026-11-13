"""Builds the customer's five real (redacted) Investec statements as engine input for tests."""

from __future__ import annotations

import json
from datetime import date
from decimal import Decimal
from pathlib import Path

from unittest.mock import patch

import pytest

import categorisation.service as categorisation_service
from categorisation.merchant_memory import MerchantMemory
from categorisation.service import CategorisableTransaction, categorise_batch
from leak_intelligence.models import FeatureTransaction
from leak_intelligence.statement_review import StatementContext, context_from_printed_figures
from pdf_processor.statement_figures import extract_printed_figures

FIXTURE = Path(__file__).parent / "fixtures" / "statement_review" / "investec_8379_transactions.json"

# These fixtures are a real customer's statements and are never committed (see .gitignore).
# Importing this module from a test skips that test module when they are not in the checkout.
if not FIXTURE.exists():
    pytest.skip(
        "The private statement fixtures are not in this checkout (tests/fixtures/statement_review).",
        allow_module_level=True,
    )

# The categories the live catalogue offers. No AI runs: only the deterministic rules classify.
CATALOGUE = [
    "Other", "Transfers", "Bank Fees", "Savings", "Other Income", "Salary", "Income",
    "Airtime & Data", "Ride Hailing", "Transport", "Groceries", "Subscriptions", "Restaurants",
    "Fast Food", "Fuel", "Utilities", "Shopping", "Entertainment", "Healthcare", "Education",
    "Housing", "Cash Withdrawal",
]


def _no_ai(*_args, **_kwargs):
    raise AssertionError("A test tried to send statement lines to an AI provider.")


def investec_transactions() -> list[FeatureTransaction]:
    rows = json.loads(FIXTURE.read_text(encoding="utf-8"))
    # A catalogue switches the AI step on when keys are in .env. A test must never send a
    # customer's statement lines to a provider, so the AI step is shut off here, not trusted
    # to be off by configuration.
    with (
        patch.object(categorisation_service.settings, "ai_categorisation_enabled", False),
        patch.object(categorisation_service, "classify_batch", _no_ai),
    ):
        categorised = categorise_batch(
            [
                CategorisableTransaction(
                    transaction_id=row["id"],
                    description=row["description"],
                    amount=Decimal(row["amount"]),
                    transaction_type=row["type"],
                    bank="investec",
                )
                for row in rows
            ],
            CATALOGUE,
            merchant_memory=MerchantMemory(),
        )
    return [
        FeatureTransaction(
            transaction_id=row["id"],
            user_id="user-a",
            amount=Decimal(row["amount"]),
            transaction_date=date.fromisoformat(row["date"]),
            description=row["description"],
            merchant_name=categorised[row["id"]].merchant_name,
            transaction_type=row["type"],
            categorisation=categorised[row["id"]],
            account_last4="8379",
            bank_key="investec",
        )
        for row in rows
    ]


def investec_inputs():
    """What the pipeline reads for one user: rows, features, the account and its coverage."""
    from types import SimpleNamespace

    from leak_intelligence.coverage import AccountRecord, build_coverage
    from leak_intelligence.engine import build_financial_features

    transactions = investec_transactions()
    accounts = [AccountRecord(account_id="acc-1", institution="Investec", last4="8379")]
    return SimpleNamespace(
        transactions=transactions,
        snapshot=build_financial_features("user-a", transactions),
        accounts=accounts,
        coverage=build_coverage([], accounts),
    )


HEADERS = Path(__file__).parent / "fixtures" / "statement_review" / "investec_headers"
ACCOUNT_LABEL = "Investec Private Bank account (ending 8379)"


def investec_figure_rows() -> list[dict[str, object]]:
    """What the import stores for each statement: the figures read from its printed header.

    The header text is page one of each real statement, up to the transaction table.
    """
    rows = []
    for path in sorted(HEADERS.glob("2026-*.txt")):
        figures = extract_printed_figures(path.read_text(encoding="utf-8"))
        assert figures is not None, path.name
        rows.append({"account_id": "acc-1", "printed_figures": figures.model_dump(mode="json")})
    return rows


def investec_context() -> StatementContext:
    """The context the report builds from the stored figures, with nothing typed in by hand."""
    return context_from_printed_figures(investec_figure_rows(), ACCOUNT_LABEL)
