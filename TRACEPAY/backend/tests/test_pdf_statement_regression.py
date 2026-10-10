"""A fictional statement PDF through extraction, categorisation, and intelligence."""

import io
from datetime import date
from decimal import Decimal

import pytest
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import SimpleDocTemplate, Table

from leak_intelligence.adapters import feature_transaction_from_row
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.engine import build_financial_features
from leak_intelligence.leak_engine import detect_leaks
from leak_intelligence.reasoning_engine import analyze_financial_reasoning
from leak_intelligence.recommendation_engine import recommend_actions
from pdf_processor.main import process_pdf
from tests.test_categorisation import LIVE_CATEGORIES

_USER_ID = "user-a"
_EXPECTED = (
    (date(2026, 7, 1), "FIXED DEPOSIT CONTRIBUTION", Decimal("-1000.00"), "debit"),
    (date(2026, 7, 2), "MONTHLY ACCOUNT FEE", Decimal("-50.00"), "debit"),
    (date(2026, 7, 3), "SERVICE CHARGE", Decimal("-15.00"), "debit"),
    (date(2026, 7, 5), "NETFLIX", Decimal("-199.00"), "debit"),
    (date(2026, 7, 9), "FOREIGN TRANSACTION FEE", Decimal("-20.00"), "debit"),
    (date(2026, 7, 18), "WOOLWORTHS", Decimal("-186.40"), "debit"),
    (date(2026, 7, 18), "WOOLWORTHS REFUND", Decimal("186.40"), "credit"),
    (date(2026, 7, 25), "SALARY ACME", Decimal("22000.00"), "credit"),
    (date(2026, 7, 26), "Money transferred out from GoalSave", Decimal("-1500.00"), "debit"),
    (date(2026, 8, 9), "FOREIGN TRANSACTION FEE", Decimal("-20.00"), "debit"),
    (date(2026, 8, 14), "CHECKERS", Decimal("-40.00"), "debit"),
    (date(2026, 9, 4), "KFC", Decimal("-89.90"), "debit"),
    (date(2026, 9, 4), "KFC", Decimal("-89.90"), "debit"),
    (date(2026, 9, 9), "FOREIGN TRANSACTION FEE", Decimal("-120.00"), "debit"),
)


def _statement_pdf() -> bytes:
    lines = [
        "Fictional TracePay statement. No real account or person.",
        *(
            f"{when.strftime('%d/%m/%Y')} {description} {amount:+.2f}"
            for when, description, amount, _kind in _EXPECTED
        ),
    ]
    source = io.BytesIO()
    canvas = Canvas(source, pagesize=(595, 842))
    y = 800
    for line in lines:
        canvas.drawString(40, y, line)
        y -= 28
    canvas.save()
    return source.getvalue()


@pytest.fixture(name="extracted")
def extracted_statement(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr("pdf_processor.main.ai_extraction_available", lambda: False)
    result = process_pdf(
        _statement_pdf(),
        "fictional-statement.pdf",
        _USER_ID,
        category_names=LIVE_CATEGORIES,
    )
    return result


def test_text_pdf_extracts_every_fictional_row(extracted) -> None:
    assert extracted.raw_extraction.extraction_method == "text"
    assert extracted.raw_extraction.tables_found == 0
    assert extracted.validation.transaction_count == len(_EXPECTED)
    assert extracted.validation.rows_rejected == 0
    parsed = [
        (item.date, item.description, item.amount, item.type)
        for item in extracted.transactions
    ]
    assert parsed == list(_EXPECTED)
    assert sum(item.description == "KFC" for item in extracted.transactions) == 2


def test_extracted_classifications_and_purchase_spending(extracted) -> None:
    by_description = {}
    for item in extracted.transactions:
        by_description.setdefault(item.description, []).append(item)

    salary = by_description["SALARY ACME"][0]
    goalsave = by_description["Money transferred out from GoalSave"][0]
    deposit = by_description["FIXED DEPOSIT CONTRIBUTION"][0]
    netflix = by_description["NETFLIX"][0]
    checkers = by_description["CHECKERS"][0]
    woolworths = by_description["WOOLWORTHS"][0]
    refund = by_description["WOOLWORTHS REFUND"][0]
    fees = [
        item
        for item in extracted.transactions
        if item.description in {"MONTHLY ACCOUNT FEE", "SERVICE CHARGE", "FOREIGN TRANSACTION FEE"}
    ]

    assert salary.transaction_class == "income"
    assert salary.category_name == "Salary"
    assert goalsave.transaction_class == "internal_transfer"
    assert deposit.transaction_class == "savings"
    assert netflix.transaction_class == "spending"
    assert netflix.category_name == "Subscriptions"
    assert checkers.transaction_class == "spending"
    assert checkers.category_name == "Groceries"
    assert woolworths.transaction_class == "spending"
    assert woolworths.category_name == "Groceries"
    assert refund.transaction_class == "unknown"
    assert refund.category_name is None
    assert refund.category_rule == "description:purchase-reversal"
    assert refund.type == "credit"
    assert {item.transaction_class for item in fees} == {"bank_fee"}
    assert {item.category_name for item in fees} == {"Bank Fees"}

    features = build_financial_features(
        _USER_ID,
        [_feature_row(index, item) for index, item in enumerate(extracted.transactions)],
    )
    assert features.spending_profile.total_spending == Decimal("605.20")
    assert features.spending_profile.spending_by_category == {
        "Groceries": Decimal("226.40"),
        "Subscriptions": Decimal("199.00"),
        "Fast Food": Decimal("179.80"),
    }
    assert features.spending_profile.transfer_total == Decimal("1500.00")
    assert features.spending_profile.savings_total == Decimal("1000.00")
    assert features.income.income_total == Decimal("22000.00")
    assert features.fees.bank_fee_total == Decimal("225.00")
    assert features.fees.foreign_transaction_fee_total == Decimal("160.00")
    assert sum(month.total_outflow for month in features.months) == Decimal("605.20")


def test_table_pdf_preserves_directions_and_classes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("pdf_processor.main.ai_extraction_available", lambda: False)
    result = process_pdf(
        _table_pdf(),
        "fictional-table-statement.pdf",
        _USER_ID,
        category_names=LIVE_CATEGORIES,
    )
    assert result.raw_extraction.extraction_method == "table"
    assert result.raw_extraction.tables_found == 1
    assert result.validation.transaction_count == len(_TABLE_ROWS)
    assert result.validation.rows_rejected == 0
    parsed = [(item.date, item.description, item.amount, item.type) for item in result.transactions]
    assert parsed == [
        (when, description, amount, kind) for when, description, amount, kind, _transaction_class in _TABLE_ROWS
    ]
    assert [
        (item.description, item.transaction_class, item.category_name)
        for item in result.transactions
    ] == [
        (description, transaction_class, category)
        for _when, description, _amount, _kind, (transaction_class, category) in _TABLE_ROWS
    ]
    features = build_financial_features(
        _USER_ID,
        [_feature_row(index, item) for index, item in enumerate(result.transactions)],
    )
    assert features.spending_profile.total_spending == Decimal("605.20")
    assert features.fees.bank_fee_total == Decimal("85.00")
    assert sum(month.total_outflow for month in features.months) == features.spending_profile.total_spending


_TABLE_ROWS = (
    (date(2026, 7, 25), "SALARY ACME", Decimal("22000.00"), "credit", ("income", "Salary")),
    (
        date(2026, 7, 26),
        "Money transferred out from GoalSave",
        Decimal("-1500.00"),
        "debit",
        ("internal_transfer", "Transfers"),
    ),
    (
        date(2026, 7, 1),
        "FIXED DEPOSIT CONTRIBUTION",
        Decimal("-1000.00"),
        "debit",
        ("savings", "Savings"),
    ),
    (date(2026, 7, 5), "NETFLIX", Decimal("-199.00"), "debit", ("spending", "Subscriptions")),
    (date(2026, 7, 2), "MONTHLY ACCOUNT FEE", Decimal("-50.00"), "debit", ("bank_fee", "Bank Fees")),
    (date(2026, 7, 3), "SERVICE CHARGE", Decimal("-15.00"), "debit", ("bank_fee", "Bank Fees")),
    (date(2026, 7, 9), "FOREIGN TRANSACTION FEE", Decimal("-20.00"), "debit", ("bank_fee", "Bank Fees")),
    (date(2026, 8, 14), "CHECKERS", Decimal("-40.00"), "debit", ("spending", "Groceries")),
    (date(2026, 7, 18), "WOOLWORTHS", Decimal("-186.40"), "debit", ("spending", "Groceries")),
    (date(2026, 7, 18), "WOOLWORTHS REFUND", Decimal("186.40"), "credit", ("unknown", None)),
    (date(2026, 9, 4), "KFC", Decimal("-89.90"), "debit", ("spending", "Fast Food")),
    (date(2026, 9, 4), "KFC", Decimal("-89.90"), "debit", ("spending", "Fast Food")),
)


def _table_pdf() -> bytes:
    source = io.BytesIO()
    document = SimpleDocTemplate(source, pagesize=A4)
    header = ["Date", "Description", "Debit", "Credit", "Balance"]
    body = []
    balance = Decimal("10000.00")
    for when, description, amount, _kind, _classification in _TABLE_ROWS:
        balance += amount
        debit = f"{abs(amount):.2f}" if amount < 0 else "0.00"
        credit = f"{amount:.2f}" if amount > 0 else "0.00"
        body.append([when.strftime("%d/%m/%Y"), description, debit, credit, f"{balance:.2f}"])
    document.build([Table([header, *body])])
    return source.getvalue()


def test_extracted_kfc_pair_stays_a_verification_candidate(extracted) -> None:
    transactions = [_feature_row(index, item) for index, item in enumerate(extracted.transactions)]
    snapshot = build_financial_features(_USER_ID, transactions)
    behaviours = analyze_behaviour(snapshot)
    leaks = detect_leaks(snapshot, behaviours)
    reasoning = analyze_financial_reasoning(snapshot, behaviours, leaks)
    recommendations = recommend_actions(reasoning)

    duplicate = next(item for item in leaks.leaks if item.leak_type == "duplicate_payment_leak")
    analysis = next(item for item in reasoning.analyses if item.leak_id == duplicate.leak_id)
    recommendation = next(
        item
        for item in recommendations.recommendations
        if item.source_reasoning_id == analysis.reasoning_id
    )

    assert len(snapshot.duplicate_candidates) == 1
    assert snapshot.duplicate_candidates[0].amount == Decimal("89.90")
    assert duplicate.evidence["verification_required"] is True
    assert duplicate.evidence["finding_kind"] == "verification_required"
    assert analysis.avoidability == "unknown"
    assert analysis.impact_assessment.detected_amount == Decimal("89.90")
    assert analysis.impact_assessment.recoverable_amount is None
    assert analysis.impact_assessment.potentially_avoidable_amount is None
    assert recommendation.recommendation_type == "verify_potential_duplicate"
    assert recommendation.potential_recovery_amount is None
    assert recommendation.expected_savings_amount is None
    assert "not recovered money" in recommendation.explanation
    assert "has not confirmed" in recommendation.explanation


def _feature_row(index: int, item):
    return feature_transaction_from_row(
        {
            "id": f"pdf-{index}",
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
