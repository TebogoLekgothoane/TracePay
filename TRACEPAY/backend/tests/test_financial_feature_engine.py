from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.auth import require_supabase_user
from app.main import app
from categorisation.models import CategorisationResult
from leak_intelligence.engine import build_financial_features
from leak_intelligence.models import FeatureTransaction
from leak_intelligence.report import render_feature_report


def _transaction(
    transaction_id: str,
    amount: str,
    when: date,
    *,
    user_id: str = "user-a",
    merchant: str | None = "NETFLIX",
    category: str | None = "Subscriptions",
    transaction_class: str = "spending",
    description: str = "NETFLIX",
    confidence: float = 0.95,
    transaction_type: str = "debit",
) -> FeatureTransaction:
    return FeatureTransaction(
        transaction_id=transaction_id,
        user_id=user_id,
        amount=Decimal(amount),
        transaction_date=when,
        merchant_name=merchant,
        description=description,
        transaction_type=transaction_type,  # type: ignore[arg-type]
        categorisation=CategorisationResult(
            category_name=category,
            category_confidence=confidence,
            transaction_class=transaction_class,  # type: ignore[arg-type]
            classification_confidence=confidence,
            merchant_name=merchant,
        ),
    )


def test_merchant_aggregation_and_price_change() -> None:
    snapshot = build_financial_features(
        "user-a",
        [
            _transaction("1", "199", date(2026, 8, 1)),
            _transaction("2", "199", date(2026, 9, 1)),
            _transaction("3", "249", date(2026, 10, 1)),
        ],
    )
    merchant = snapshot.merchants[0]
    assert merchant.merchant_transaction_count == 3
    assert merchant.merchant_total_amount == Decimal("647")
    assert merchant.merchant_average_amount == Decimal("647") / Decimal("3")
    assert merchant.merchant_amount_trend is not None
    assert merchant.merchant_amount_trend.amount_change == Decimal("50")
    assert merchant.merchant_amount_trend.percentage_change == Decimal("50") / Decimal("199") * Decimal("100")


def test_merchant_aggregation_matches_expected_amounts() -> None:
    snapshot = build_financial_features(
        "user-a",
        [
            _transaction("1", "199", date(2026, 8, 1)),
            _transaction("2", "199", date(2026, 9, 1)),
            _transaction("3", "219", date(2026, 10, 1)),
        ],
    )
    merchant = snapshot.merchants[0]
    assert merchant.merchant_transaction_count == 3
    assert merchant.merchant_total_amount == Decimal("617")
    assert merchant.merchant_average_amount.quantize(Decimal("0.01")) == Decimal("205.67")


def test_monthly_category_and_fee_aggregation() -> None:
    snapshot = build_financial_features(
        "user-a",
        [
            _transaction("1", "100", date(2026, 8, 1), merchant="SHOP", category="Groceries"),
            _transaction("2", "200", date(2026, 9, 1), merchant="SHOP", category="Groceries"),
            _transaction("5", "150", date(2026, 10, 1), merchant="SHOP", category="Groceries"),
            _transaction("3", "3000", date(2026, 9, 25), merchant=None, category="Salary", transaction_class="income", transaction_type="credit"),
            _transaction("4", "10", date(2026, 9, 26), merchant=None, category="Bank Fees", transaction_class="bank_fee", description="ATM FEE"),
        ],
    )
    september = next(item for item in snapshot.months if item.month == "2026-09")
    groceries = next(item for item in snapshot.categories if item.category_name == "Groceries")
    assert september.total_income == Decimal("3000")
    assert september.total_outflow == Decimal("210")
    assert groceries.category_total_amount == Decimal("450")
    assert len(snapshot.months) == 3
    assert snapshot.fees.bank_fee_total == Decimal("10")
    assert snapshot.fees.atm_fee_total == Decimal("10")


def test_regular_monthly_payments_have_high_recurrence() -> None:
    snapshot = build_financial_features(
        "user-a",
        [
            _transaction("1", "199", date(2026, 8, 1)),
            _transaction("2", "199", date(2026, 9, 1)),
            _transaction("3", "199", date(2026, 10, 1)),
            _transaction("4", "199", date(2026, 11, 1)),
        ],
    )
    assert snapshot.merchants[0].recurrence.recurrence_strength == "high"


def test_random_intervals_are_not_strongly_recurring() -> None:
    snapshot = build_financial_features(
        "user-a",
        [
            _transaction("1", "199", date(2026, 1, 1)),
            _transaction("2", "199", date(2026, 1, 4)),
            _transaction("3", "199", date(2026, 4, 1)),
            _transaction("4", "199", date(2026, 5, 20)),
        ],
    )
    assert snapshot.merchants[0].recurrence.recurrence_strength != "high"


def test_cash_income_payday_and_duplicate_candidates() -> None:
    snapshot = build_financial_features(
        "user-a",
        [
            _transaction("income-1", "5000", date(2026, 8, 25), merchant=None, category="Salary", transaction_class="income", transaction_type="credit"),
            _transaction("income-2", "5000", date(2026, 9, 25), merchant=None, category="Salary", transaction_class="income", transaction_type="credit"),
            _transaction("income-3", "5000", date(2026, 10, 25), merchant=None, category="Salary", transaction_class="income", transaction_type="credit"),
            _transaction("cash", "500", date(2026, 10, 26), merchant=None, category="Cash Withdrawal", description="ATM WITHDRAWAL"),
            _transaction("duplicate-1", "50", date(2026, 10, 27), merchant="COFFEE", category="Restaurants"),
            _transaction("duplicate-2", "50", date(2026, 10, 27), merchant="COFFEE", category="Restaurants"),
        ],
    )
    assert snapshot.cash.cash_withdrawal_count == 1
    assert snapshot.cash.cash_withdrawal_total == Decimal("500")
    assert snapshot.income.estimated_payday_interval is not None
    assert snapshot.income.days_since_last_income["cash"] == 1
    assert len(snapshot.duplicate_candidates) == 1


def test_one_transaction_does_not_create_pattern_statistics() -> None:
    snapshot = build_financial_features("user-a", [_transaction("1", "199", date(2026, 8, 1))])
    merchant = snapshot.merchants[0]
    assert merchant.merchant_average_interval_days is None
    assert merchant.merchant_amount_trend is None
    assert merchant.recurrence.recurrence_strength == "none"
    assert snapshot.duplicate_candidates == []


def test_low_confidence_is_retained_and_user_isolation_is_enforced() -> None:
    transaction = _transaction("1", "199", date(2026, 8, 1), confidence=0.35)
    snapshot = build_financial_features("user-a", [transaction])
    assert snapshot.merchants[0].confidence_support.low_confidence_transaction_count == 1
    with pytest.raises(ValueError, match="multiple users"):
        build_financial_features(
            "user-a",
            [transaction, _transaction("2", "100", date(2026, 8, 2), user_id="user-b")],
        )


def test_adapter_rejects_cross_user_rows() -> None:
    from leak_intelligence.adapters import FeatureRowValidationError, feature_transaction_from_row

    with pytest.raises(FeatureRowValidationError, match="does not match"):
        feature_transaction_from_row(
            {
                "id": "tx-1",
                "user_id": "user-b",
                "date": "2026-08-01",
                "amount": "199",
                "type": "debit",
                "categories": {"name": "Subscriptions"},
            },
            expected_user_id="user-a",
        )


def test_feature_endpoint_returns_sanitized_snapshot(monkeypatch: pytest.MonkeyPatch) -> None:
    snapshot = build_financial_features(
        "user-a",
        [_transaction("tx-1", "199", date(2026, 8, 1), description="NETFLIX REF 123456789")],
    )

    async def fake_snapshot(user_id: str, token: str):
        assert user_id == "user-a"
        assert token == "test-token"
        return snapshot

    monkeypatch.setattr("app.main.build_user_feature_snapshot", fake_snapshot)
    app.dependency_overrides[require_supabase_user] = lambda: "user-a"
    try:
        response = TestClient(app).get(
            "/financial-features",
            headers={"Authorization": "Bearer test-token"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["transaction_count"] == 1
    assert "description" not in response.text
    assert "123456789" not in response.text


def test_feature_endpoint_hides_transaction_identifiers(monkeypatch: pytest.MonkeyPatch) -> None:
    transaction_ids = ("txn-feature-dup-1", "txn-feature-dup-2", "txn-feature-income")
    snapshot = build_financial_features(
        "user-a",
        [
            _transaction(
                transaction_ids[2],
                "5000",
                date(2026, 7, 1),
                merchant="EMPLOYER",
                category="Salary",
                transaction_class="income",
                transaction_type="credit",
                description="SALARY",
            ),
            _transaction(
                transaction_ids[0],
                "50",
                date(2026, 8, 1),
                merchant="COFFEE",
                category="Fast Food",
                description="COFFEE",
            ),
            _transaction(
                transaction_ids[1],
                "50",
                date(2026, 8, 1),
                merchant="COFFEE",
                category="Fast Food",
                description="COFFEE",
            ),
        ],
    )
    assert snapshot.duplicate_candidates[0].transaction_ids == [
        transaction_ids[0],
        transaction_ids[1],
    ]
    assert set(snapshot.income.days_since_last_income) == set(transaction_ids)

    async def fake_snapshot(user_id: str, token: str):
        assert user_id == "user-a"
        assert token == "test-token"
        return snapshot

    monkeypatch.setattr("app.main.build_user_feature_snapshot", fake_snapshot)
    app.dependency_overrides[require_supabase_user] = lambda: "user-a"
    try:
        response = TestClient(app).get(
            "/financial-features",
            headers={"Authorization": "Bearer test-token"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.text
    assert "transaction_ids" not in body
    assert "days_since_last_income" not in body
    for transaction_id in transaction_ids:
        assert transaction_id not in body
    assert "COFFEE" in body
    assert snapshot.duplicate_candidates[0].transaction_ids == [
        transaction_ids[0],
        transaction_ids[1],
    ]


def test_feature_report_is_aggregate_only() -> None:
    snapshot = build_financial_features(
        "user-a",
        [_transaction("tx-1", "199", date(2026, 8, 1), description="NETFLIX REF 123456789")],
    )
    report = render_feature_report(snapshot)
    assert "TRACEPAY FINANCIAL FEATURE REPORT" in report
    assert "Transactions analysed: 1" in report
    assert "NETFLIX" not in report
    assert "123456789" not in report
