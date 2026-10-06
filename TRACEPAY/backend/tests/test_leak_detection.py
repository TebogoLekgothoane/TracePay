from datetime import date
from decimal import Decimal

from fastapi.testclient import TestClient

from app.auth import require_supabase_user
from app.main import app
from categorisation.models import CategorisationResult
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.engine import build_financial_features
from leak_intelligence.leak_engine import detect_leaks
from leak_intelligence.leak_report import render_leak_report
from leak_intelligence.models import FeatureTransaction


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
    user_id: str = "user-a",
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


def _detect(transactions: list[FeatureTransaction]):
    snapshot = build_financial_features("user-a", transactions)
    return detect_leaks(snapshot, analyze_behaviour(snapshot))


def _types(transactions: list[FeatureTransaction]) -> set[str]:
    return {item.leak_type for item in _detect(transactions).leaks}


def test_empty_and_single_transaction_have_no_leaks() -> None:
    assert _detect([]).leaks == []
    assert _detect([_transaction("one", "500", date(2026, 8, 1))]).leaks == []


def test_bank_fee_leak_annualizes_material_fee_escalation() -> None:
    transactions = [
        _transaction("fee-1", "10", date(2026, 7, 2), merchant=None, category="Bank Fees", transaction_class="bank_fee", description="ACCOUNT FEE"),
        _transaction("fee-2", "20", date(2026, 8, 2), merchant=None, category="Bank Fees", transaction_class="bank_fee", description="ACCOUNT FEE"),
        _transaction("fee-3", "80", date(2026, 9, 30), merchant=None, category="Bank Fees", transaction_class="bank_fee", description="ACCOUNT FEE"),
    ]
    leak = next(item for item in _detect(transactions).leaks if item.leak_type == "bank_fee_leak")
    assert leak.impact_kind == "recurring"
    assert leak.estimated_annual_impact == leak.estimated_monthly_impact * Decimal("12")
    assert leak.confidence <= 0.82


def test_subscription_and_unknown_recurring_leaks_are_separate() -> None:
    subscriptions = [
        _transaction(f"netflix-{index}", "199", when, merchant="NETFLIX", category="Subscriptions")
        for index, when in enumerate((date(2026, 7, 1), date(2026, 8, 1), date(2026, 9, 30)))
    ]
    subscription = next(
        item for item in _detect(subscriptions).leaks if item.leak_type == "subscription_leak"
    )
    assert subscription.estimated_monthly_impact > 0
    assert subscription.confidence <= 0.90

    unknown = [
        _transaction(f"unknown-{index}", "99", when, merchant="PAYMENT SERVICE", category="Other")
        for index, when in enumerate((date(2026, 7, 1), date(2026, 8, 1), date(2026, 9, 30)))
    ]
    unknown_leak = next(
        item
        for item in _detect(unknown).leaks
        if item.leak_type == "unknown_recurring_payment"
    )
    assert unknown_leak.confidence <= 0.70
    assert unknown_leak.evidence["merchant_key"] is None


def test_spending_escalation_and_category_detectors() -> None:
    spending = [
        _transaction("a", "100", date(2026, 7, 1)),
        _transaction("b", "200", date(2026, 8, 1)),
        _transaction("c", "400", date(2026, 9, 30)),
    ]
    assert "spending_escalation_leak" in _types(spending)

    food = [
        _transaction("fast-1", "100", date(2026, 7, 1), merchant="FAST", category="Fast Food"),
        _transaction("fast-2", "200", date(2026, 8, 1), merchant="FAST", category="Fast Food"),
        _transaction("fast-3", "500", date(2026, 9, 30), merchant="FAST", category="Fast Food"),
        *[
            _transaction(f"grocery-{index}", "1000", when, merchant="GROCERY", category="Groceries")
            for index, when in enumerate((date(2026, 7, 2), date(2026, 8, 2), date(2026, 9, 29)))
        ],
    ]
    assert "food_spending_leak" in _types(food)


def test_airtime_and_transport_require_frequency_and_material_growth() -> None:
    airtime = [
        _transaction("air-1", "40", date(2026, 7, 1), merchant="MTN", category="Airtime & Data"),
        _transaction("air-2", "40", date(2026, 7, 2), merchant="MTN", category="Airtime & Data"),
        _transaction("air-3", "40", date(2026, 8, 1), merchant="MTN", category="Airtime & Data"),
        _transaction("air-4", "40", date(2026, 8, 2), merchant="MTN", category="Airtime & Data"),
        _transaction("air-5", "100", date(2026, 9, 28), merchant="MTN", category="Airtime & Data"),
        _transaction("air-6", "100", date(2026, 9, 29), merchant="MTN", category="Airtime & Data"),
        _transaction("air-7", "100", date(2026, 9, 30), merchant="MTN", category="Airtime & Data"),
    ]
    assert "airtime_data_leak" in _types(airtime)

    transport = [
        _transaction("ride-1", "100", date(2026, 7, 1), merchant="UBER", category="Ride Hailing"),
        _transaction("ride-2", "100", date(2026, 8, 1), merchant="UBER", category="Ride Hailing"),
        _transaction("ride-3", "200", date(2026, 9, 29), merchant="UBER", category="Ride Hailing"),
        _transaction("ride-4", "200", date(2026, 9, 30), merchant="UBER", category="Ride Hailing"),
        *[
            _transaction(f"groceries-{index}", "1000", when, merchant="GROCERY", category="Groceries")
            for index, when in enumerate((date(2026, 7, 2), date(2026, 8, 2), date(2026, 9, 28)))
        ],
    ]
    assert "transport_spending_leak" in _types(transport)


def test_cash_and_duplicate_rules_remain_conservative() -> None:
    cash = [
        _transaction("cash-1", "100", date(2026, 7, 1), merchant=None, category="Cash Withdrawal"),
        _transaction("cash-2", "200", date(2026, 8, 1), merchant=None, category="Cash Withdrawal"),
        _transaction("cash-3", "300", date(2026, 9, 30), merchant=None, category="Cash Withdrawal"),
        _transaction("atm-1", "20", date(2026, 7, 2), merchant=None, category="Bank Fees", transaction_class="bank_fee", description="ATM FEE"),
        _transaction("atm-2", "20", date(2026, 8, 2), merchant=None, category="Bank Fees", transaction_class="bank_fee", description="ATM FEE"),
        _transaction("atm-3", "20", date(2026, 9, 29), merchant=None, category="Bank Fees", transaction_class="bank_fee", description="ATM FEE"),
    ]
    assert "cash_usage_leak" in _types(cash)

    duplicate = [
        _transaction("coffee-1", "50", date(2026, 7, 1), merchant="COFFEE", category="Restaurants"),
        _transaction("coffee-2", "50", date(2026, 7, 1), merchant="COFFEE", category="Restaurants"),
        _transaction("later", "100", date(2026, 9, 30), merchant="OTHER", category="Shopping"),
    ]
    leak = next(
        item for item in _detect(duplicate).leaks if item.leak_type == "duplicate_payment_leak"
    )
    assert leak.impact_kind == "one_time"
    assert leak.estimated_annual_impact is None
    assert leak.confidence <= 0.68
    assert "transaction_ids" not in leak.evidence


def test_low_confidence_and_repeated_runs_do_not_duplicate_leaks() -> None:
    transactions = [
        _transaction("a", "100", date(2026, 7, 1), confidence=0.35),
        _transaction("b", "200", date(2026, 8, 1), confidence=0.35),
        _transaction("c", "500", date(2026, 9, 30), confidence=0.35),
    ]
    assert "spending_escalation_leak" not in _types(transactions)
    assert "food_spending_leak" not in _types(
        [
            _transaction("a", "100", date(2026, 7, 1), category="Fast Food", confidence=0.35),
            _transaction("b", "200", date(2026, 8, 1), category="Fast Food", confidence=0.35),
            _transaction("c", "500", date(2026, 9, 30), category="Fast Food", confidence=0.35),
            *[
                _transaction(f"g-{index}", "1000", when, category="Groceries")
                for index, when in enumerate((date(2026, 7, 2), date(2026, 8, 2), date(2026, 9, 29)))
            ],
        ]
    )
    first = _detect(transactions)
    second = _detect(transactions)
    assert [item.fingerprint for item in first.leaks] == [item.fingerprint for item in second.leaks]
    assert len({item.fingerprint for item in first.leaks}) == len(first.leaks)


def test_user_isolation_and_report_sanitization() -> None:
    user_a = _detect(
        [
            _transaction("a", "100", date(2026, 7, 1)),
            _transaction("b", "200", date(2026, 8, 1)),
            _transaction("c", "500", date(2026, 9, 30)),
        ]
    )
    other_transactions = [
        _transaction("a", "100", date(2026, 7, 1), user_id="user-b"),
        _transaction("b", "200", date(2026, 8, 1), user_id="user-b"),
        _transaction("c", "500", date(2026, 9, 30), user_id="user-b"),
    ]
    user_b_snapshot = build_financial_features("user-b", other_transactions)
    user_b = detect_leaks(user_b_snapshot, analyze_behaviour(user_b_snapshot))
    assert user_a.user_id == "user-a"
    assert user_b.user_id == "user-b"
    assert "SHOP" not in render_leak_report(user_a)


def test_leak_endpoint_requires_authentication() -> None:
    assert TestClient(app).get("/leak-detections").status_code == 401


def test_leak_endpoint_is_sanitized(monkeypatch) -> None:
    result = _detect(
        [
            _transaction("coffee-1", "50", date(2026, 7, 1), merchant="COFFEE", category="Restaurants", description="COFFEE REF 123456789"),
            _transaction("coffee-2", "50", date(2026, 7, 1), merchant="COFFEE", category="Restaurants", description="COFFEE REF 123456789"),
            _transaction("later", "100", date(2026, 9, 30), merchant="OTHER", category="Shopping"),
        ]
    )

    async def fake_leaks(user_id: str, token: str):
        assert user_id == "user-a"
        assert token == "test-token"
        return result

    monkeypatch.setattr("app.main.build_user_leak_detections", fake_leaks)
    app.dependency_overrides[require_supabase_user] = lambda: "user-a"
    try:
        response = TestClient(app).get(
            "/leak-detections",
            headers={"Authorization": "Bearer test-token"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert "transaction_ids" not in response.text
    assert "123456789" not in response.text
