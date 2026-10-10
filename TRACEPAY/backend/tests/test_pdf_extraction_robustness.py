"""Supported statement formatting variations through the real PDF extractor."""

import io
from datetime import date
from decimal import Decimal

import pytest
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import PageBreak, SimpleDocTemplate, Table

from leak_intelligence.adapters import feature_transaction_from_row
from leak_intelligence.engine import build_financial_features
from pdf_processor.main import process_pdf
from tests.test_categorisation import LIVE_CATEGORIES

_USER_ID = "user-a"


def _text_pdf(lines: list[str], *, gap: float) -> bytes:
    source = io.BytesIO()
    canvas = Canvas(source, pagesize=A4)
    y = 800
    for line in lines:
        canvas.drawString(40, y, line)
        y -= gap
    canvas.save()
    return source.getvalue()


def _process(content: bytes, filename: str, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("pdf_processor.main.ai_extraction_available", lambda: False)
    return process_pdf(content, filename, _USER_ID, category_names=LIVE_CATEGORIES)


def test_text_variations_keep_dates_amounts_and_reject_malformed_rows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    lines = [
        "Fictional statement. Not a transaction.",
        "25/07/2026 SALARY ACME +22,000.00",
        "26/07/2026 Money transferred out from GoalSave -1,500.00",
        "2026-07-01 FIXED DEPOSIT CONTRIBUTION -1 000.00",
        "05-07-2026 NETFLIX -199.00",
        "13/07/2026 FOREIGN TRANSACTION FEE -20.00",
        "07/13/2026 SERVICE CHARGE -15.00",
        "04/07/2026 CHECKERS -40.00",
        "18/07/2026 POS PURCHASE: CHECKERS, SANDTON. REF 48291 -40.00",
        "18/07/2026 WOOLWORTHS (186.40)",
        "19/07/2026 WOOLWORTHS 186.40",
        "20/07/2026 CHECKERS REF -48291 -40.00",
    ]
    result = _process(_text_pdf(lines, gap=10), "fictional-text-variations.pdf", monkeypatch)
    parsed = [
        (item.date, item.description, item.amount, item.type) for item in result.transactions
    ]

    assert result.raw_extraction.extraction_method == "text"
    assert parsed == [
        (date(2026, 7, 25), "SALARY ACME", Decimal("22000.00"), "credit"),
        (date(2026, 7, 26), "Money transferred out from GoalSave", Decimal("-1500.00"), "debit"),
        (date(2026, 7, 1), "FIXED DEPOSIT CONTRIBUTION", Decimal("-1000.00"), "debit"),
        (date(2026, 7, 5), "NETFLIX", Decimal("-199.00"), "debit"),
        (date(2026, 7, 13), "FOREIGN TRANSACTION FEE", Decimal("-20.00"), "debit"),
        (date(2026, 7, 13), "SERVICE CHARGE", Decimal("-15.00"), "debit"),
        (date(2026, 7, 4), "CHECKERS", Decimal("-40.00"), "debit"),
        (
            date(2026, 7, 18),
            "POS PURCHASE: CHECKERS, SANDTON. REF 48291",
            Decimal("-40.00"),
            "debit",
        ),
        (date(2026, 7, 18), "WOOLWORTHS", Decimal("-186.40"), "debit"),
    ]
    assert result.validation.rows_rejected == 2
    assert result.validation.duplicate_count == 0
    assert any("could not be normalized" in warning for warning in result.validation.warnings)
    assert result.transactions[0].transaction_class == "income"
    assert result.transactions[1].transaction_class == "internal_transfer"
    assert result.transactions[2].transaction_class == "savings"
    assert result.transactions[3].category_name == "Subscriptions"
    assert result.transactions[4].transaction_class == "bank_fee"
    assert result.transactions[5].transaction_class == "bank_fee"
    assert result.transactions[7].amount == Decimal("-40.00")

    features = build_financial_features(
        _USER_ID,
        [
            feature_transaction_from_row(
                {
                    "id": f"text-{index}",
                    "user_id": _USER_ID,
                    "date": item.date.isoformat(),
                    "description": item.description,
                    "amount": str(item.amount),
                    "type": item.type,
                    "is_duplicate": False,
                    "merchant_name": item.merchant_name,
                    "category_confidence": item.category_confidence,
                    "category_rule": item.category_rule,
                    "transaction_class": item.transaction_class,
                    "classification_confidence": item.classification_confidence,
                    "classification_reason": item.classification_reason,
                    "categories": {"name": item.category_name} if item.category_name else None,
                },
                expected_user_id=_USER_ID,
            )
            for index, item in enumerate(result.transactions)
        ],
    )
    assert features.income.income_total == Decimal("22000.00")
    assert features.spending_profile.transfer_total == Decimal("1500.00")
    assert features.fees.bank_fee_total == Decimal("35.00")
    assert features.spending_profile.total_spending == Decimal("465.40")


def test_comma_thousands_without_cents_keep_direction_and_totals(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    text = _process(
        _text_pdf(
            [
                "25/07/2026 SALARY ACME +22,000",
                "26/07/2026 CHECKERS -1,500",
                "18/07/2026 WOOLWORTHS (1,500)",
            ],
            gap=16,
        ),
        "fictional-thousands-text.pdf",
        monkeypatch,
    )
    assert text.raw_extraction.extraction_method == "text"
    assert [
        (item.description, item.amount, item.type, item.transaction_class)
        for item in text.transactions
    ] == [
        ("SALARY ACME", Decimal("22000"), "credit", "income"),
        ("CHECKERS", Decimal("-1500"), "debit", "spending"),
        ("WOOLWORTHS", Decimal("-1500"), "debit", "spending"),
    ]
    text_features = _features(text.transactions)
    assert text_features.income.income_total == Decimal("22000")
    assert text_features.spending_profile.total_spending == Decimal("3000")

    table = _process(_thousands_table_pdf(), "fictional-thousands-table.pdf", monkeypatch)
    assert table.raw_extraction.extraction_method == "table"
    assert [
        (item.description, item.amount, item.type, item.transaction_class)
        for item in table.transactions
    ] == [
        ("SALARY ACME", Decimal("22000"), "credit", "income"),
        ("CHECKERS", Decimal("-1500"), "debit", "spending"),
    ]
    table_features = _features(table.transactions)
    assert table_features.income.income_total == Decimal("22000")
    assert table_features.spending_profile.total_spending == Decimal("1500")


def _features(transactions):
    return build_financial_features(
        _USER_ID,
        [
            feature_transaction_from_row(
                {
                    "id": f"amount-{index}",
                    "user_id": _USER_ID,
                    "date": item.date.isoformat(),
                    "description": item.description,
                    "amount": str(item.amount),
                    "type": item.type,
                    "is_duplicate": False,
                    "merchant_name": item.merchant_name,
                    "category_confidence": item.category_confidence,
                    "category_rule": item.category_rule,
                    "transaction_class": item.transaction_class,
                    "classification_confidence": item.classification_confidence,
                    "classification_reason": item.classification_reason,
                    "categories": {"name": item.category_name} if item.category_name else None,
                },
                expected_user_id=_USER_ID,
            )
            for index, item in enumerate(transactions)
        ],
    )


def _thousands_table_pdf() -> bytes:
    source = io.BytesIO()
    document = SimpleDocTemplate(source, pagesize=A4)
    document.build(
        [
            Table(
                [
                    ["Date", "Description", "Debit", "Credit", "Balance"],
                    ["25/07/2026", "SALARY ACME", "0.00", "22,000", "22000.00"],
                    ["26/07/2026", "CHECKERS", "1,500", "0.00", "20500.00"],
                ]
            )
        ]
    )
    return source.getvalue()


def test_table_variations_span_pages_and_reject_bad_rows(monkeypatch: pytest.MonkeyPatch) -> None:
    result = _process(_table_pdf(), "fictional-table-variations.pdf", monkeypatch)
    parsed = [
        (item.date, item.description, item.amount, item.type) for item in result.transactions
    ]

    assert result.raw_extraction.extraction_method == "table"
    assert result.raw_extraction.pages == 2
    assert result.raw_extraction.tables_found == 2
    assert parsed == [
        (date(2026, 7, 25), "SALARY ACME", Decimal("22000.00"), "credit"),
        (date(2026, 7, 26), "Money transferred out from GoalSave", Decimal("-1500.00"), "debit"),
        (
            date(2026, 8, 1),
            "POS PURCHASE: CHECKERS, SANDTON. REF 48291 CITY CENTRE",
            Decimal("-40.00"),
            "debit",
        ),
        (date(2026, 9, 4), "KFC", Decimal("-89.90"), "debit"),
        (date(2026, 9, 5), "NETFLIX", Decimal("-199.00"), "debit"),
    ]
    assert result.validation.rows_rejected == 2
    assert result.validation.duplicate_count == 0
    assert result.transactions[0].transaction_class == "income"
    assert result.transactions[1].transaction_class == "internal_transfer"
    assert result.transactions[2].amount == Decimal("-40.00")
    assert result.transactions[2].category_name == "Groceries"
    assert result.transactions[4].category_name == "Subscriptions"


def _table_pdf() -> bytes:
    source = io.BytesIO()
    document = SimpleDocTemplate(source, pagesize=A4)
    header = ["Date", "Description", "Debit", "Credit", "Balance"]
    first = [
        header,
        ["25 Jul 2026", "SALARY ACME", "0.00", "22,000.00", "32000.00"],
        ["26/07/2026", "Money transferred out from GoalSave", "1,500.00", "0.00", "30500.00"],
        ["01/08/2026", "POS PURCHASE: CHECKERS, SANDTON. REF 48291", "40.00", "0.00", "30460.00"],
        ["", "CITY CENTRE", "", "", ""],
        ["32/07/2026", "WOOLWORTHS", "10.00", "0.00", "30450.00"],
        ["18/07/2026", "WOOLWORTHS", "", "", ""],
    ]
    second = [
        header,
        ["2026-09-04", "KFC", "89.90", "0.00", "30360.10"],
        ["05-09-2026", "NETFLIX", "199.00", "0.00", "30161.10"],
    ]
    document.build([Table(first), PageBreak(), Table(second)])
    return source.getvalue()
