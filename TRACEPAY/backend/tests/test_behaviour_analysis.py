from datetime import date, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient

from app.auth import require_supabase_user
from app.main import app
from categorisation.models import CategorisationResult
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.behaviour_report import render_behaviour_report
from leak_intelligence.engine import build_financial_features
from leak_intelligence.models import FeatureTransaction
from leak_intelligence.periods import completed_months


def _transaction(
    transaction_id: str,
    amount: str,
    when: date,
    *,
    merchant: str | None = "SHOP",
    category: str | None = "Groceries",
    transaction_class: str = "spending",
    confidence: float = 0.95,
    transaction_type: str = "debit",
    description: str = "SHOP",
) -> FeatureTransaction:
    return FeatureTransaction(
        transaction_id=transaction_id,
        user_id="user-a",
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


def _types(transactions: list[FeatureTransaction]) -> set[str]:
    return {
        observation.behavior_type
        for observation in analyze_behaviour(
            build_financial_features("user-a", transactions)
        ).observations
    }


def test_empty_and_single_transaction_return_no_observations() -> None:
    assert analyze_behaviour(build_financial_features("user-a", [])).observations == []
    assert _types([_transaction("one", "100", date(2026, 8, 1))]) == set()


def test_category_and_total_spending_increase_are_observed() -> None:
    transactions = [
        _transaction("a", "100", date(2026, 7, 1)),
        _transaction("b", "150", date(2026, 8, 1)),
        _transaction("c", "300", date(2026, 9, 30)),
    ]
    observations = analyze_behaviour(build_financial_features("user-a", transactions)).observations
    category = next(item for item in observations if item.behavior_type == "category_growth")
    total = next(item for item in observations if item.behavior_type == "spending_increase")
    assert category.evidence["previous_amount"] == Decimal("125")
    assert category.evidence["current_amount"] == Decimal("300")
    assert total.confidence >= 0.55


def test_category_decrease_and_low_confidence_suppression() -> None:
    decreasing = [
        _transaction("a", "300", date(2026, 7, 1)),
        _transaction("b", "200", date(2026, 8, 1)),
        _transaction("c", "100", date(2026, 9, 30)),
    ]
    assert "category_decline" in _types(decreasing)
    low_confidence = [
        _transaction("a", "100", date(2026, 7, 1), confidence=0.35),
        _transaction("b", "150", date(2026, 8, 1), confidence=0.35),
        _transaction("c", "300", date(2026, 9, 30), confidence=0.35),
    ]
    assert "category_growth" not in _types(low_confidence)


def test_recurring_price_and_duplicate_patterns_are_neutral_candidates() -> None:
    transactions = [
        _transaction("netflix-1", "199", date(2026, 8, 1), merchant="NETFLIX", category="Subscriptions"),
        _transaction("netflix-2", "199", date(2026, 9, 1), merchant="NETFLIX", category="Subscriptions"),
        _transaction("netflix-3", "249", date(2026, 10, 1), merchant="NETFLIX", category="Subscriptions"),
        _transaction("coffee-1", "50", date(2026, 10, 2), merchant="COFFEE", category="Restaurants"),
        _transaction("coffee-2", "50", date(2026, 10, 2), merchant="COFFEE", category="Restaurants"),
    ]
    result = analyze_behaviour(build_financial_features("user-a", transactions))
    types = {item.behavior_type for item in result.observations}
    assert "recurring_payment_pattern" in types
    assert "price_increase_pattern" in types
    duplicate = next(item for item in result.observations if item.behavior_type == "duplicate_payment_pattern")
    assert duplicate.evidence["candidate_only"] is True
    assert "transaction_ids" not in duplicate.evidence
    assert all("leak" not in item.description.lower() for item in result.observations)


def test_merchant_frequency_increase_requires_history_and_confidence() -> None:
    transactions = [
        *[
            _transaction(f"uber-july-{index}", "20", date(2026, 7, index + 1), merchant="UBER", category="Ride Hailing")
            for index in range(2)
        ],
        *[
            _transaction(f"uber-august-{index}", "20", date(2026, 8, index + 1), merchant="UBER", category="Ride Hailing")
            for index in range(2)
        ],
        *[
            _transaction(f"uber-september-{index}", "20", date(2026, 9, 26 + index), merchant="UBER", category="Ride Hailing")
            for index in range(5)
        ],
    ]
    observations = analyze_behaviour(build_financial_features("user-a", transactions)).observations
    frequency = next(
        item
        for item in observations
        if item.behavior_type == "merchant_frequency_increase"
    )
    assert frequency.evidence["previous_count"] == Decimal("2")
    assert frequency.evidence["current_count"] == 5


def test_weekend_and_payday_patterns_require_sufficient_history() -> None:
    transactions = []
    for index, income_day in enumerate((date(2026, 8, 25), date(2026, 9, 25), date(2026, 10, 25))):
        transactions.append(
            _transaction(
                f"income-{index}",
                "5000",
                income_day,
                merchant=None,
                category="Salary",
                transaction_class="income",
                transaction_type="credit",
            )
        )
        for payment in range(4):
            transactions.append(
                _transaction(
                    f"spend-{index}-{payment}",
                    "100",
                    income_day + timedelta(days=payment % 3),
                    merchant=f"SHOP-{payment}",
                )
            )
    result = analyze_behaviour(build_financial_features("user-a", transactions))
    assert "payday_spending_pattern" in {item.behavior_type for item in result.observations}

    weekend_only = [
        _transaction(f"weekend-{index}", "100", date(2026, 8, 1) + timedelta(days=index * 7))
        for index in range(10)
    ]
    assert "weekend_spending_pattern" in _types(weekend_only)


def test_cash_fee_and_income_observations_are_conservative() -> None:
    transactions = [
        _transaction("income-1", "5000", date(2026, 7, 25), merchant=None, category="Salary", transaction_class="income", transaction_type="credit"),
        _transaction("income-2", "5000", date(2026, 8, 25), merchant=None, category="Salary", transaction_class="income", transaction_type="credit"),
        _transaction("income-3", "5000", date(2026, 9, 30), merchant=None, category="Salary", transaction_class="income", transaction_type="credit"),
        _transaction("cash-1", "100", date(2026, 7, 1), merchant=None, category="Cash Withdrawal"),
        _transaction("cash-2", "200", date(2026, 8, 1), merchant=None, category="Cash Withdrawal"),
        _transaction("cash-3", "300", date(2026, 9, 30), merchant=None, category="Cash Withdrawal"),
        _transaction("fee-1", "10", date(2026, 7, 2), merchant=None, category="Bank Fees", transaction_class="bank_fee", description="ACCOUNT FEE"),
        _transaction("fee-2", "20", date(2026, 8, 2), merchant=None, category="Bank Fees", transaction_class="bank_fee", description="ACCOUNT FEE"),
        _transaction("fee-3", "80", date(2026, 9, 29), merchant=None, category="Bank Fees", transaction_class="bank_fee", description="ACCOUNT FEE"),
    ]
    types = _types(transactions)
    assert "cash_dependency" in types
    assert "fee_accumulation" in types
    assert "income_pattern" in types


def test_irregular_income_requires_three_income_events() -> None:
    transactions = [
        _transaction("income-1", "5000", date(2026, 7, 1), merchant=None, category="Salary", transaction_class="income", transaction_type="credit"),
        _transaction("income-2", "5000", date(2026, 7, 8), merchant=None, category="Salary", transaction_class="income", transaction_type="credit"),
        _transaction("income-3", "5000", date(2026, 9, 30), merchant=None, category="Salary", transaction_class="income", transaction_type="credit"),
    ]
    assert "irregular_income" in _types(transactions)


def test_missing_months_zero_baselines_and_report_are_safe() -> None:
    transactions = [
        _transaction("a", "100", date(2026, 8, 1)),
        _transaction("b", "100", date(2026, 10, 1)),
        _transaction("c", "200", date(2026, 12, 1)),
    ]
    result = analyze_behaviour(build_financial_features("user-a", transactions))
    report = render_behaviour_report(result)
    assert "TRACEPAY BEHAVIOUR ANALYSIS REPORT" in report
    assert "SHOP" not in report
    assert "recommend" not in report.lower()


def test_analysis_isolated_between_separate_user_snapshots() -> None:
    user_a = build_financial_features("user-a", [_transaction("a", "100", date(2026, 8, 1))])
    user_b_transaction = _transaction("b", "5000", date(2026, 8, 1))
    user_b_transaction = FeatureTransaction(
        **{**user_b_transaction.__dict__, "user_id": "user-b"}
    )
    user_b = build_financial_features("user-b", [user_b_transaction])
    assert analyze_behaviour(user_a).user_id == "user-a"
    assert analyze_behaviour(user_b).user_id == "user-b"


def test_behaviour_and_completed_months_drop_the_same_incomplete_final_month() -> None:
    snapshot = build_financial_features(
        "user-a",
        [
            _transaction("jul", "100", date(2026, 7, 31)),
            _transaction("aug", "100", date(2026, 8, 31)),
            _transaction("sep", "400", date(2026, 9, 30)),
            _transaction("oct", "20", date(2026, 10, 10)),
        ],
    )
    months = [month.month for month in completed_months(snapshot)]
    assert months == ["2026-07", "2026-08", "2026-09"]
    observation = next(
        item
        for item in analyze_behaviour(snapshot).observations
        if item.behavior_type == "spending_increase"
    )
    assert observation.evidence["current_period"] == months[-1]
    assert observation.evidence["months_compared"] == len(months)


def test_behaviour_endpoint_requires_authentication() -> None:
    assert TestClient(app).get("/behaviour-analysis").status_code == 401


def test_behaviour_endpoint_is_sanitized(monkeypatch) -> None:
    snapshot = build_financial_features(
        "user-a",
        [
            _transaction("coffee-1", "50", date(2026, 10, 2), merchant="COFFEE", description="COFFEE REF 123456789"),
            _transaction("coffee-2", "50", date(2026, 10, 2), merchant="COFFEE", description="COFFEE REF 123456789"),
        ],
    )
    result = analyze_behaviour(snapshot)

    async def fake_analysis(user_id: str, token: str):
        assert user_id == "user-a"
        assert token == "test-token"
        return result

    monkeypatch.setattr("app.main.build_user_behaviour_analysis", fake_analysis)
    app.dependency_overrides[require_supabase_user] = lambda: "user-a"
    try:
        response = TestClient(app).get(
            "/behaviour-analysis",
            headers={"Authorization": "Bearer test-token"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert "transaction_ids" not in response.text
    assert "123456789" not in response.text
