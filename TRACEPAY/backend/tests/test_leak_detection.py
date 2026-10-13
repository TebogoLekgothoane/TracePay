from datetime import date
from decimal import Decimal

from typing import get_args

from fastapi.testclient import TestClient

from app.auth import require_supabase_user
from app.main import app
from categorisation.models import CategorisationResult
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.engine import build_financial_features
from leak_intelligence.leak_engine import detect_leaks
from leak_intelligence.reasoning_engine import analyze_financial_reasoning
from leak_intelligence.recommendation_models import RecommendationType
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
    # MoM fee change is estimated impact; annualisation uses the recurring monthly average.
    assert leak.impact_kind == "estimated"
    assert leak.evidence["monthly_average_fee"] is not None
    assert leak.estimated_annual_impact == leak.evidence["monthly_average_fee"] * Decimal("12")
    assert leak.confidence <= 0.82


def test_subscription_and_unknown_recurring_leaks_are_separate() -> None:
    subscriptions = [
        _transaction(f"netflix-{index}", "199", when, merchant="NETFLIX", category="Subscriptions")
        for index, when in enumerate(
            (date(2026, 7, 1), date(2026, 8, 1), date(2026, 9, 1), date(2026, 10, 1))
        )
    ]
    subscription = next(
        item for item in _detect(subscriptions).leaks if item.leak_type == "subscription_leak"
    )
    assert subscription.estimated_monthly_impact > 0
    assert subscription.confidence <= 0.90
    assert subscription.evidence["finding_focus"] == "subscription_review"

    unknown = [
        _transaction(f"unknown-{index}", "99", when, merchant="PAYMENT SERVICE", category="Other")
        for index, when in enumerate(
            (date(2026, 7, 1), date(2026, 8, 1), date(2026, 9, 1), date(2026, 10, 1))
        )
    ]
    unknown_leak = next(
        item
        for item in _detect(unknown).leaks
        if item.leak_type == "unknown_recurring_payment"
    )
    assert unknown_leak.confidence <= 0.70
    assert unknown_leak.evidence["merchant_key"] is None
    assert unknown_leak.evidence.get("finding_focus") is None


def test_repeated_convenience_store_purchases_are_not_a_recurring_bill() -> None:
    transactions = [
        _transaction(
            f"spar-{index}",
            "60",
            when,
            merchant="SPAR EXPRESS",
            category="Groceries",
            description="POS PURCHASE SPAR EXPRESS",
        )
        for index, when in enumerate(
            (date(2026, 7, 4), date(2026, 8, 4), date(2026, 9, 4), date(2026, 10, 4))
        )
    ]
    types = _types(transactions)
    assert "subscription_leak" not in types
    assert "recurring_payment_leak" not in types
    assert "food_spending_leak" not in types


def test_repeated_coffee_purchases_are_not_a_subscription() -> None:
    transactions = [
        _transaction(
            f"coffee-{index}",
            "45",
            when,
            merchant="SEATTLE COFFEE",
            category="Restaurants",
            description="POS PURCHASE SEATTLE COFFEE",
        )
        for index, when in enumerate(
            (date(2026, 7, 1), date(2026, 7, 8), date(2026, 7, 15), date(2026, 7, 22))
        )
    ]
    types = _types(transactions)
    assert "subscription_leak" not in types
    assert "recurring_payment_leak" not in types


def test_debit_order_descriptions_produce_review_focus_without_replacing_subscriptions() -> None:
    debit_orders = [
        _transaction(
            f"gym-{index}",
            "450",
            when,
            merchant="VIRGIN ACTIVE",
            category="Other",
            description="DEBIT ORDER VIRGIN ACTIVE",
        )
        for index, when in enumerate(
            (date(2026, 7, 1), date(2026, 8, 1), date(2026, 9, 1), date(2026, 10, 1))
        )
    ]
    leak = next(
        item for item in _detect(debit_orders).leaks if item.leak_type == "unknown_recurring_payment"
    )
    assert leak.evidence["finding_focus"] == "debit_order_review"
    assert leak.evidence["merchant_key"] == "VIRGIN ACTIVE"

    grocery = [
        _transaction(f"shop-{index}", "900", when, merchant="CHECKERS", category="Groceries")
        for index, when in enumerate(
            (date(2026, 7, 3), date(2026, 8, 3), date(2026, 9, 3))
        )
    ]
    grocery_types = {item.leak_type for item in _detect(grocery).leaks}
    assert "recurring_payment_leak" not in grocery_types
    assert "subscription_leak" not in grocery_types


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
    assert all(
        item.evidence.get("finding_focus") not in {"impulse_spending_pattern", "food_delivery_dependency"}
        for item in _detect(food).leaks
    )

    shopping_burst = [
        _transaction(f"shop-{index}", "120", date(2026, 9, 6 + index), merchant="PICK N PAY", category="Shopping")
        for index in range(8)
    ]
    shopping_leaks = _detect(shopping_burst).leaks
    assert all(item.leak_type != "food_spending_leak" for item in shopping_leaks)
    assert all(item.evidence.get("finding_focus") != "impulse_spending_pattern" for item in shopping_leaks)


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
    assert all(
        item.evidence.get("finding_focus") != "airtime_inefficiency"
        for item in _detect(airtime).leaks
    )

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


def test_airtime_inefficiency_requires_airtime_evidence() -> None:
    airtime = [
        _transaction(
            f"air-{index}",
            amount,
            when,
            merchant="MTN",
            category="Airtime & Data",
            description="PREPAID AIRTIME MTN",
        )
        for index, (amount, when) in enumerate(
            (
                ("40", date(2026, 7, 1)),
                ("40", date(2026, 7, 2)),
                ("40", date(2026, 8, 1)),
                ("40", date(2026, 8, 2)),
                ("100", date(2026, 9, 28)),
                ("100", date(2026, 9, 29)),
                ("100", date(2026, 9, 30)),
            )
        )
    ]
    leak = next(item for item in _detect(airtime).leaks if item.leak_type == "airtime_data_leak")
    assert leak.evidence["finding_focus"] == "airtime_inefficiency"
    assert "wasting" not in leak.description.lower()
    assert "subscription_leak" not in _types(airtime)
    assert "recurring_payment_leak" not in _types(airtime)
    assert "airtime_data_leak" not in _types(airtime[:1])

    data = [
        _transaction(
            f"data-{index}",
            amount,
            when,
            merchant="VODACOM",
            category="Airtime & Data",
            description="VODACOM DATA BUNDLE",
        )
        for index, (amount, when) in enumerate(
            (
                ("40", date(2026, 7, 1)),
                ("40", date(2026, 7, 2)),
                ("40", date(2026, 8, 1)),
                ("40", date(2026, 8, 2)),
                ("100", date(2026, 9, 28)),
                ("100", date(2026, 9, 29)),
                ("100", date(2026, 9, 30)),
            )
        )
    ]
    data_leak = next(item for item in _detect(data).leaks if item.leak_type == "airtime_data_leak")
    assert data_leak.evidence["finding_focus"] == "data_inefficiency"
    assert data_leak.evidence.get("finding_focus") != "airtime_inefficiency"
    assert data_leak.evidence["merchant_key"] == "VODACOM"
    assert data_leak.description.startswith(
        "Mobile data spending increased over the analysed period and may warrant review."
    )

    generic = [
        _transaction(
            f"mobile-{index}",
            "80",
            when,
            merchant="MTN",
            category="Groceries",
            description="PAYMENT TO MTN",
        )
        for index, when in enumerate((date(2026, 7, 1), date(2026, 8, 1), date(2026, 9, 30)))
    ]
    assert "airtime_data_leak" not in _types(generic)

    low_confidence = [
        _transaction(
            f"low-{index}",
            amount,
            when,
            merchant="MTN",
            category="Airtime & Data",
            description="PREPAID AIRTIME MTN",
            confidence=0.35,
        )
        for index, (amount, when) in enumerate(
            (
                ("40", date(2026, 7, 1)),
                ("40", date(2026, 7, 2)),
                ("40", date(2026, 8, 1)),
                ("40", date(2026, 8, 2)),
                ("100", date(2026, 9, 28)),
                ("100", date(2026, 9, 29)),
                ("100", date(2026, 9, 30)),
            )
        )
    ]
    assert "airtime_data_leak" not in _types(low_confidence)

    duplicated = []
    for index, when in enumerate((date(2026, 7, 1), date(2026, 8, 1), date(2026, 9, 1), date(2026, 9, 30))):
        duplicated.append(
            _transaction(
                f"dup-{index}",
                "80",
                when,
                merchant="MTN",
                category="Airtime & Data",
                description="PREPAID AIRTIME MTN",
            )
        )
        duplicated.append(
            _transaction(
                f"dup-copy-{index}",
                "80",
                when,
                merchant="MTN",
                category="Airtime & Data",
                description="PREPAID AIRTIME MTN",
            )
        )
    assert "airtime_data_leak" not in _types(duplicated)

    repeated = [
        _transaction(
            f"monthly-{index}",
            "50",
            when,
            merchant="MTN",
            category="Airtime & Data",
            description="PREPAID AIRTIME MTN",
        )
        for index, when in enumerate((date(2026, 7, 3), date(2026, 8, 3), date(2026, 9, 3)))
    ]
    assert "subscription_leak" not in _types(repeated)
    assert "recurring_payment_leak" not in _types(repeated)
    subscription = [
        _transaction(f"netflix-{index}", "99", when, merchant="NETFLIX", category="Subscriptions")
        for index, when in enumerate((date(2026, 7, 3), date(2026, 8, 3), date(2026, 9, 3)))
    ]
    assert "subscription_leak" in _types(subscription)


def test_data_and_ride_hailing_focuses_reject_adjacent_patterns() -> None:
    assert "airtime_data_leak" not in _types(
        [
            _transaction(
                "one-data",
                "149",
                date(2026, 9, 30),
                merchant="VODACOM",
                category="Airtime & Data",
                description="VODACOM DATA BUNDLE",
            )
        ]
    )
    generic_networks = [
        _transaction(f"mtn-{index}", "80", when, merchant="MTN", category="Groceries", description="PAYMENT TO MTN")
        for index, when in enumerate((date(2026, 7, 1), date(2026, 8, 1), date(2026, 9, 30)))
    ]
    generic_networks.extend(
        _transaction(
            f"vodacom-{index}",
            "80",
            when,
            merchant="VODACOM",
            category="Groceries",
            description="PAYMENT TO VODACOM",
        )
        for index, when in enumerate((date(2026, 7, 2), date(2026, 8, 2), date(2026, 9, 29)))
    )
    assert "airtime_data_leak" not in _types(generic_networks)

    flat_data = [
        _transaction(
            f"flat-{index}",
            "79",
            when,
            merchant="VODACOM",
            category="Airtime & Data",
            description="VODACOM DATA BUNDLE",
        )
        for index, when in enumerate((date(2026, 7, 5), date(2026, 8, 5), date(2026, 9, 30)))
    ]
    assert "airtime_data_leak" not in _types(flat_data)
    assert "recurring_payment_leak" not in _types(flat_data)
    assert "subscription_leak" not in _types(flat_data)

    fuel = [
        _transaction(f"fuel-{index}", amount, when, merchant="SHELL", category="Fuel", description="SHELL FUEL")
        for index, (amount, when) in enumerate(
            (
                ("200", date(2026, 7, 1)),
                ("200", date(2026, 8, 1)),
                ("400", date(2026, 9, 29)),
                ("400", date(2026, 9, 30)),
            )
        )
    ]
    fuel.extend(
        _transaction(f"pad-{index}", "1000", when, merchant="CHECKERS", category="Groceries")
        for index, when in enumerate((date(2026, 7, 2), date(2026, 8, 2), date(2026, 9, 28)))
    )
    fuel_leak = next(item for item in _detect(fuel).leaks if item.leak_type == "transport_spending_leak")
    assert fuel_leak.evidence.get("finding_focus") != "ride_hailing_dependency"

    public_transport = [
        _transaction(
            f"rail-{index}",
            amount,
            when,
            merchant="GAUTRAIN",
            category="Public Transport",
            description="GAUTRAIN TICKET",
        )
        for index, (amount, when) in enumerate(
            (
                ("80", date(2026, 7, 4)),
                ("80", date(2026, 8, 4)),
                ("180", date(2026, 9, 27)),
                ("180", date(2026, 9, 30)),
            )
        )
    ]
    public_transport.extend(
        _transaction(f"shop-{index}", "1000", when, merchant="CHECKERS", category="Groceries")
        for index, when in enumerate((date(2026, 7, 6), date(2026, 8, 6), date(2026, 9, 26)))
    )
    rail_leak = next(
        item for item in _detect(public_transport).leaks if item.leak_type == "transport_spending_leak"
    )
    assert rail_leak.evidence.get("finding_focus") != "ride_hailing_dependency"

    rides = [
        _transaction(f"uber-{index}", amount, when, merchant="UBER", category="Ride Hailing", description="UBER TRIP")
        for index, (amount, when) in enumerate(
            (
                ("100", date(2026, 7, 1)),
                ("100", date(2026, 8, 1)),
                ("200", date(2026, 9, 29)),
                ("200", date(2026, 9, 30)),
            )
        )
    ]
    rides.extend(
        _transaction(f"grocery-{index}", "900", when, merchant="CHECKERS", category="Groceries")
        for index, when in enumerate((date(2026, 7, 3), date(2026, 8, 3), date(2026, 9, 3)))
    )
    ride_leak = next(item for item in _detect(rides).leaks if item.leak_type == "transport_spending_leak")
    assert ride_leak.evidence["finding_focus"] == "ride_hailing_dependency"
    assert "depend" not in ride_leak.description.lower()
    assert "transport_spending_leak" not in _types(rides[:1])

    low_confidence = [
        _transaction(
            f"low-uber-{index}",
            amount,
            when,
            merchant="UBER",
            category="Ride Hailing",
            description="UBER TRIP",
            confidence=0.35,
        )
        for index, (amount, when) in enumerate(
            (
                ("100", date(2026, 7, 1)),
                ("100", date(2026, 8, 1)),
                ("200", date(2026, 9, 29)),
                ("200", date(2026, 9, 30)),
            )
        )
    ]
    assert "transport_spending_leak" not in _types(low_confidence)

    duplicated = []
    for amount, when in (("100", date(2026, 7, 1)), ("100", date(2026, 8, 1)), ("400", date(2026, 9, 30))):
        duplicated.append(
            _transaction(
                f"copy-{when.isoformat()}",
                amount,
                when,
                merchant="UBER",
                category="Ride Hailing",
                description="UBER TRIP",
            )
        )
        duplicated.append(
            _transaction(
                f"copy-extra-{when.isoformat()}",
                amount,
                when,
                merchant="UBER",
                category="Ride Hailing",
                description="UBER TRIP",
            )
        )
    duplicated.extend(
        _transaction(f"base-{index}", "1000", when, merchant="CHECKERS", category="Groceries")
        for index, when in enumerate((date(2026, 7, 4), date(2026, 8, 4), date(2026, 9, 28)))
    )
    assert "transport_spending_leak" not in _types(duplicated)

    eats = [
        _transaction(
            f"eats-{index}",
            amount,
            when,
            merchant="UBER EATS",
            category="Restaurants",
            description="UBER EATS ORDER",
        )
        for index, (amount, when) in enumerate(
            (
                ("100", date(2026, 7, 1)),
                ("100", date(2026, 8, 1)),
                ("200", date(2026, 9, 30)),
            )
        )
    ]
    delivery = next(item for item in _detect(eats).leaks if item.leak_type == "food_spending_leak")
    assert delivery.evidence["finding_focus"] == "food_delivery_dependency"
    assert all(
        item.evidence.get("finding_focus") != "ride_hailing_dependency" for item in _detect(eats).leaks
    )


def test_food_delivery_focus_rejects_adjacent_food_patterns() -> None:
    assert "food_spending_leak" not in _types(
        [
            _transaction(
                "one-delivery",
                "180",
                date(2026, 9, 30),
                merchant="UBER EATS",
                category="Restaurants",
                description="UBER EATS ORDER",
            )
        ]
    )
    restaurant = [
        _transaction(
            f"kfc-{index}",
            amount,
            when,
            merchant="KFC",
            category="Fast Food",
            description="KFC SANDTON",
        )
        for index, (amount, when) in enumerate(
            (
                ("80", date(2026, 7, 4)),
                ("80", date(2026, 8, 4)),
                ("200", date(2026, 9, 30)),
            )
        )
    ]
    restaurant_leak = next(item for item in _detect(restaurant).leaks if item.leak_type == "food_spending_leak")
    assert restaurant_leak.evidence.get("finding_focus") != "food_delivery_dependency"

    takeaway = [
        _transaction(
            f"takeaway-{index}",
            amount,
            when,
            merchant="LOCAL KITCHEN",
            category="Restaurants",
            description="TAKEAWAY ORDER",
        )
        for index, (amount, when) in enumerate(
            (
                ("90", date(2026, 7, 6)),
                ("90", date(2026, 8, 6)),
                ("220", date(2026, 9, 30)),
            )
        )
    ]
    takeaway_leak = next(item for item in _detect(takeaway).leaks if item.leak_type == "food_spending_leak")
    assert takeaway_leak.evidence.get("finding_focus") != "food_delivery_dependency"

    generic_delivery = [
        _transaction(
            f"courier-{index}",
            amount,
            when,
            merchant="COURIER",
            category="Shopping",
            description="DELIVERY FEE",
        )
        for index, (amount, when) in enumerate(
            (
                ("40", date(2026, 7, 2)),
                ("40", date(2026, 8, 2)),
                ("90", date(2026, 9, 30)),
            )
        )
    ]
    assert all(
        item.evidence.get("finding_focus") != "food_delivery_dependency"
        for item in _detect(generic_delivery).leaks
    )

    low_confidence = [
        _transaction(
            f"low-eats-{index}",
            amount,
            when,
            merchant="UBER EATS",
            category="Restaurants",
            description="UBER EATS ORDER",
            confidence=0.35,
        )
        for index, (amount, when) in enumerate(
            (
                ("120", date(2026, 7, 8)),
                ("180", date(2026, 8, 8)),
                ("320", date(2026, 9, 30)),
            )
        )
    ]
    assert "food_spending_leak" not in _types(low_confidence)

    copied = []
    for amount, when in (("120", date(2026, 7, 8)), ("180", date(2026, 8, 8)), ("320", date(2026, 9, 30))):
        copied.append(
            _transaction(
                f"eats-{when.isoformat()}",
                amount,
                when,
                merchant="UBER EATS",
                category="Restaurants",
                description="UBER EATS ORDER",
            )
        )
        copied.append(
            _transaction(
                f"eats-copy-{when.isoformat()}",
                amount,
                when,
                merchant="UBER EATS",
                category="Restaurants",
                description="UBER EATS ORDER",
            )
        )
    copied_leak = next(item for item in _detect(copied).leaks if item.leak_type == "food_spending_leak")
    assert copied_leak.evidence["finding_focus"] == "food_delivery_dependency"
    assert copied_leak.evidence["food_delivery_transaction_count"] == 3
    assert copied_leak.evidence["food_delivery_total"] == Decimal("620")

    ride = [
        _transaction(
            f"uber-{index}",
            amount,
            when,
            merchant="UBER",
            category="Ride Hailing",
            description="UBER TRIP",
        )
        for index, (amount, when) in enumerate(
            (
                ("100", date(2026, 7, 1)),
                ("100", date(2026, 8, 1)),
                ("200", date(2026, 9, 29)),
                ("200", date(2026, 9, 30)),
            )
        )
    ]
    ride.extend(
        _transaction(f"pad-{index}", "1000", when, merchant="CHECKERS", category="Groceries")
        for index, when in enumerate((date(2026, 7, 3), date(2026, 8, 3), date(2026, 9, 3)))
    )
    ride_leak = next(item for item in _detect(ride).leaks if item.leak_type == "transport_spending_leak")
    assert ride_leak.evidence["finding_focus"] == "ride_hailing_dependency"
    assert ride_leak.evidence.get("finding_focus") != "food_delivery_dependency"


def test_bank_fees_are_not_grouped_as_duplicate_candidates() -> None:
    transactions = [
        _transaction(
            "fee-1",
            "8",
            date(2026, 7, 2),
            merchant=None,
            category="Bank Fees",
            transaction_class="bank_fee",
            description="IMMEDIATE PAYMENT FEE",
        ),
        _transaction(
            "fee-2",
            "8",
            date(2026, 7, 3),
            merchant=None,
            category="Bank Fees",
            transaction_class="bank_fee",
            description="IMMEDIATE PAYMENT FEE",
        ),
    ]
    snapshot = build_financial_features("user-a", transactions)
    assert snapshot.duplicate_candidates == []


def test_immediate_payment_fee_overuse_produces_bank_fee_leak() -> None:
    transactions = []
    for month, count in ((7, 4), (8, 8)):
        for index in range(count):
            if index == count - 1:
                day = 30 if month == 7 else 31
            else:
                day = min(2 + index, 27)
            transactions.append(
                _transaction(
                    f"fee-{month}-{index}",
                    "8",
                    date(2026, month, day),
                    merchant=None,
                    category="Bank Fees",
                    transaction_class="bank_fee",
                    description="IMMEDIATE PAYMENT FEE",
                )
            )
    leak = next(item for item in _detect(transactions).leaks if item.leak_type == "bank_fee_leak")
    assert leak.title == "Potential immediate payment fee burden"
    assert leak.evidence["immediate_payment_fee_total"] == Decimal("96")
    assert "duplicate_payment_leak" not in _types(transactions)


def test_balance_enquiry_fees_are_typed_separately_from_atm_withdrawal_fees() -> None:
    snapshot = build_financial_features(
        "user-a",
        [
            _transaction(
                "enquiry-fee",
                "5",
                date(2026, 7, 2),
                merchant=None,
                category="Bank Fees",
                transaction_class="bank_fee",
                description="BALANCE ENQUIRY FEE",
            ),
            _transaction(
                "atm-fee",
                "20",
                date(2026, 7, 3),
                merchant=None,
                category="Bank Fees",
                transaction_class="bank_fee",
                description="ATM WITHDRAWAL FEE",
            ),
        ],
    )
    assert snapshot.fees.balance_enquiry_fee_total == Decimal("5")
    assert snapshot.fees.atm_fee_total == Decimal("20")
    assert snapshot.cash.atm_fee_total == Decimal("20")


def test_repeated_balance_enquiry_fees_produce_bank_fee_leak() -> None:
    transactions = []
    for month in (7, 8):
        for day in (2, 3):
            transactions.append(
                _transaction(
                    f"fee-{month}-{day}",
                    "5",
                    date(2026, month, day),
                    merchant=None,
                    category="Bank Fees",
                    transaction_class="bank_fee",
                    description="BALANCE ENQUIRY FEE",
                )
            )
    for day in (2, 3, 4):
        transactions.append(
            _transaction(
                f"fee-9-{day}",
                "5",
                date(2026, 9, day),
                merchant=None,
                category="Bank Fees",
                transaction_class="bank_fee",
                description="BALANCE ENQUIRY FEE",
            )
        )
    leak = next(item for item in _detect(transactions).leaks if item.leak_type == "bank_fee_leak")
    assert leak.title == "Potential ATM balance enquiry fee burden"
    assert leak.evidence["finding_focus"] == "atm_balance_enquiry"
    assert leak.evidence["balance_enquiry_fee_total"] == Decimal("35")


def test_rising_monthly_account_fees_produce_monthly_banking_fee_trend() -> None:
    transactions = [
        _transaction(
            "fee-jul",
            "69",
            date(2026, 7, 2),
            merchant=None,
            category="Bank Fees",
            transaction_class="bank_fee",
            description="MONTHLY ACCOUNT FEE",
        ),
        _transaction(
            "fee-aug",
            "89",
            date(2026, 8, 2),
            merchant=None,
            category="Bank Fees",
            transaction_class="bank_fee",
            description="MONTHLY ACCOUNT FEE",
        ),
        _transaction(
            "fee-sep",
            "149",
            date(2026, 9, 30),
            merchant=None,
            category="Bank Fees",
            transaction_class="bank_fee",
            description="MONTHLY ACCOUNT FEE",
        ),
    ]
    leak = next(item for item in _detect(transactions).leaks if item.leak_type == "bank_fee_leak")
    assert leak.title == "Potential monthly banking fee increase"
    assert leak.evidence["finding_focus"] == "monthly_banking_fee_trend"
    assert leak.evidence["completed_month_count"] == 3


def test_recurring_card_fee_change_is_distinct_from_other_amount_patterns() -> None:
    card_fees = [
        _transaction(
            f"card-{month}",
            amount,
            date(2026, month, 30 if month == 9 else 2),
            merchant=None,
            category="Bank Fees",
            transaction_class="bank_fee",
            description="MONTHLY CARD FEE",
        )
        for month, amount in ((7, "25"), (8, "35"), (9, "45"))
    ]
    leak = next(item for item in _detect(card_fees).leaks if item.leak_type == "bank_fee_leak")
    assert leak.evidence["finding_focus"] == "recurring_merchant_fee_change"
    assert leak.evidence["card_fee_transaction_count"] == 3
    assert leak.evidence["previous_amount"] == Decimal("30")
    assert leak.evidence["current_amount"] == Decimal("45")
    assert leak.evidence["fee_change_amount"] == Decimal("15")
    assert leak.evidence.get("merchant_key") is None
    assert "official" not in leak.description.lower()
    assert "refund" not in leak.description.lower()

    low_confidence = [
        _transaction(
            f"low-card-{month}",
            amount,
            date(2026, month, 30 if month == 9 else 2),
            merchant=None,
            category="Bank Fees",
            transaction_class="bank_fee",
            description="MONTHLY CARD FEE",
            confidence=0.35,
        )
        for month, amount in ((7, "25"), (8, "35"), (9, "45"))
    ]
    assert all(
        item.evidence.get("finding_focus") != "recurring_merchant_fee_change"
        for item in _detect(low_confidence).leaks
    )

    copied = [
        _transaction(
            "card-jul",
            "25",
            date(2026, 7, 2),
            merchant=None,
            category="Bank Fees",
            transaction_class="bank_fee",
            description="MONTHLY CARD FEE",
        ),
        _transaction(
            "card-aug",
            "35",
            date(2026, 8, 2),
            merchant=None,
            category="Bank Fees",
            transaction_class="bank_fee",
            description="MONTHLY CARD FEE",
        ),
        _transaction(
            "card-sep",
            "45",
            date(2026, 9, 30),
            merchant=None,
            category="Bank Fees",
            transaction_class="bank_fee",
            description="MONTHLY CARD FEE",
        ),
        _transaction(
            "card-sep-copy",
            "45",
            date(2026, 9, 30),
            merchant=None,
            category="Bank Fees",
            transaction_class="bank_fee",
            description="MONTHLY CARD FEE",
        ),
    ]
    assert all(
        item.evidence.get("finding_focus") != "recurring_merchant_fee_change"
        for item in _detect(copied).leaks
    )

    price = [
        _transaction(f"steers-{index}", amount, date(2026, 7 + index, 12), merchant="STEERS", category="Restaurants")
        for index, amount in enumerate(("120", "160", "220"))
    ]
    price_observations = analyze_behaviour(build_financial_features("user-a", price)).observations
    merchant_price = next(item for item in price_observations if item.behavior_type == "price_increase_pattern")
    assert merchant_price.evidence["finding_focus"] == "merchant_price_increase"
    assert merchant_price.evidence.get("finding_focus") != "recurring_merchant_fee_change"


def test_currency_conversion_markup_is_not_inferred_without_rate_evidence() -> None:
    assert "exchange_rate" not in FeatureTransaction.__dataclass_fields__
    assert "original_amount" not in FeatureTransaction.__dataclass_fields__
    assert "markup_amount" not in FeatureTransaction.__dataclass_fields__
    foreign_spend = [
        _transaction(
            "amazon",
            "850",
            date(2026, 7, 4),
            merchant="AMAZON",
            category="Shopping",
            description="USD PURCHASE AMAZON",
        ),
        _transaction(
            "fee",
            "25",
            date(2026, 7, 4),
            merchant=None,
            category="Bank Fees",
            transaction_class="bank_fee",
            description="FOREIGN TRANSACTION FEE",
        ),
        _transaction("later", "100", date(2026, 9, 30), merchant="CHECKERS", category="Groceries"),
    ]
    assert all(
        item.evidence.get("finding_focus") != "currency_conversion_markup"
        for item in _detect(foreign_spend).leaks
    )
    assert all(
        item.evidence.get("finding_focus") != "dynamic_currency_conversion"
        for item in _detect(foreign_spend).leaks
    )


def test_dynamic_currency_conversion_is_not_inferred_without_conversion_evidence() -> None:
    assert "exchange_rate" not in FeatureTransaction.__dataclass_fields__
    assert "original_currency" not in FeatureTransaction.__dataclass_fields__
    assert "dcc" not in FeatureTransaction.__dataclass_fields__
    transactions = [
        _transaction(
            "atm",
            "500",
            date(2026, 7, 8),
            merchant="ATM",
            category="Cash Withdrawal",
            description="USD ATM WITHDRAWAL",
        ),
        _transaction(
            "fee",
            "35",
            date(2026, 7, 8),
            merchant=None,
            category="Bank Fees",
            transaction_class="bank_fee",
            description="FOREIGN TRANSACTION FEE",
        ),
        _transaction("later", "100", date(2026, 9, 30), merchant="CHECKERS", category="Groceries"),
    ]
    assert all(
        item.evidence.get("finding_focus") != "dynamic_currency_conversion"
        for item in _detect(transactions).leaks
    )


def test_foreign_transaction_fees_are_distinct_from_other_fee_patterns() -> None:
    fees = [
        _transaction(
            f"fx-{month}",
            "15",
            date(2026, month, 30 if month == 9 else 2),
            merchant=None,
            category="Bank Fees",
            transaction_class="bank_fee",
            description="FOREIGN TRANSACTION FEE",
        )
        for month in (7, 8, 9)
    ]
    leak = next(item for item in _detect(fees).leaks if item.leak_type == "bank_fee_leak")
    assert leak.evidence["finding_focus"] == "foreign_transaction_fee"
    assert leak.evidence["foreign_transaction_fee_count"] == 3
    assert leak.evidence["foreign_transaction_fee_total"] == Decimal("45")
    assert leak.evidence["completed_month_count"] == 3
    assert leak.description == "Repeated foreign transaction fees were observed and may warrant review."
    assert leak.evidence.get("finding_focus") != "monthly_banking_fee_trend"
    assert leak.evidence.get("finding_focus") != "recurring_merchant_fee_change"
    assert "duplicate_payment_leak" not in _types(fees)

    ordinary = [
        _transaction(
            f"txn-{month}",
            "15",
            date(2026, month, 30 if month == 9 else 2),
            merchant=None,
            category="Bank Fees",
            transaction_class="bank_fee",
            description="TRANSACTION FEE",
        )
        for month in (7, 8, 9)
    ]
    assert all(
        item.evidence.get("finding_focus") != "foreign_transaction_fee"
        for item in _detect(ordinary).leaks
    )

    purchase = [
        _transaction(
            f"usd-{month}",
            "400",
            date(2026, month, 30 if month == 9 else 4),
            merchant="AMAZON",
            category="Shopping",
            description="USD PURCHASE AMAZON",
        )
        for month in (7, 8, 9)
    ]
    assert all(
        item.evidence.get("finding_focus") != "foreign_transaction_fee"
        for item in _detect(purchase).leaks
    )

    low_confidence = [
        _transaction(
            f"low-fx-{month}",
            "15",
            date(2026, month, 30 if month == 9 else 2),
            merchant=None,
            category="Bank Fees",
            transaction_class="bank_fee",
            description="FOREIGN TRANSACTION FEE",
            confidence=0.35,
        )
        for month in (7, 8, 9)
    ]
    assert all(
        item.evidence.get("finding_focus") != "foreign_transaction_fee"
        for item in _detect(low_confidence).leaks
    )

    copied = []
    for month in (7, 8, 9):
        when = date(2026, month, 30 if month == 9 else 2)
        copied.append(
            _transaction(
                f"copy-{month}",
                "15",
                when,
                merchant=None,
                category="Bank Fees",
                transaction_class="bank_fee",
                description="FOREIGN TRANSACTION FEE",
            )
        )
        copied.append(
            _transaction(
                f"copy-extra-{month}",
                "15",
                when,
                merchant=None,
                category="Bank Fees",
                transaction_class="bank_fee",
                description="FOREIGN TRANSACTION FEE",
            )
        )
    assert all(
        item.evidence.get("finding_focus") != "foreign_transaction_fee"
        for item in _detect(copied).leaks
    )


def _monthly_fees(
    prefix: str,
    description: str,
    *,
    amount: str = "15",
    transaction_class: str = "bank_fee",
    category: str = "Bank Fees",
    merchant: str | None = None,
    confidence: float = 0.95,
) -> list[FeatureTransaction]:
    return [
        _transaction(
            f"{prefix}-{month}",
            amount,
            date(2026, month, 30 if month == 9 else 2),
            merchant=merchant,
            category=category,
            transaction_class=transaction_class,
            description=description,
            confidence=confidence,
        )
        for month in (7, 8, 9)
    ]


def test_interest_charges_are_observed_without_an_avoidability_claim() -> None:
    charges = _monthly_fees("interest", "INTEREST CHARGED")
    snapshot = build_financial_features("user-a", charges)
    behaviours = analyze_behaviour(snapshot)
    detected = detect_leaks(snapshot, behaviours)
    leak = next(item for item in detected.leaks if item.leak_type == "bank_fee_leak")
    assert leak.evidence["finding_focus"] == "interest_charges"
    assert leak.evidence["interest_charge_count"] == 3
    assert leak.evidence["interest_charge_total"] == Decimal("45")
    assert leak.evidence["completed_month_count"] == 3
    assert leak.description == "Interest charges were observed and may warrant review."
    assert "avoid" not in leak.description.lower()
    reasoning = analyze_financial_reasoning(snapshot, behaviours, detected)
    analysis = next(item for item in reasoning.analyses if item.leak_id == leak.leak_id)
    assert analysis.avoidability == "unknown"
    assert analysis.explanation == (
        "Transactions described as interest charges were observed and may warrant review."
    )
    assert leak.evidence.get("finding_focus") != "merchant_price_increase"
    assert leak.evidence.get("finding_focus") != "subscription_price_creep"
    assert leak.evidence.get("finding_focus") != "debit_order_amount_increase"

    for description, transaction_class, category in (
        ("INTEREST RECEIVED", "income", "Other Income"),
        ("INTEREST", "spending", "Shopping"),
        ("FINANCE CHARGE", "bank_fee", "Bank Fees"),
        ("CREDIT CARD PAYMENT", "spending", "Shopping"),
        ("LOAN REPAYMENT", "spending", "Shopping"),
    ):
        rows = _monthly_fees(
            description.lower().replace(" ", "-"),
            description,
            transaction_class=transaction_class,
            category=category,
            merchant="SHOP" if transaction_class == "spending" else None,
        )
        assert all(
            item.evidence.get("finding_focus") != "interest_charges"
            for item in _detect(rows).leaks
        )

    low_confidence = _monthly_fees("low-interest", "DEBIT INTEREST", confidence=0.35)
    assert all(
        item.evidence.get("finding_focus") != "interest_charges"
        for item in _detect(low_confidence).leaks
    )

    steers = [
        _transaction("steers-1", "120", date(2026, 7, 12), merchant="STEERS", category="Fast Food"),
        _transaction("steers-2", "160", date(2026, 8, 12), merchant="STEERS", category="Fast Food"),
        _transaction("steers-3", "220", date(2026, 9, 12), merchant="STEERS", category="Fast Food"),
        _transaction("pad", "80", date(2026, 9, 30), merchant="CHECKERS", category="Groceries"),
    ]
    assert all(
        item.evidence.get("finding_focus") != "interest_charges"
        for item in _detect(steers).leaks
    )
    subscriptions = [
        _transaction(
            f"netflix-{month}",
            "199",
            date(2026, month, 1),
            merchant="NETFLIX",
            category="Subscriptions",
            description="NETFLIX",
        )
        for month in (7, 8, 9)
    ]
    assert all(
        item.evidence.get("finding_focus") != "interest_charges"
        for item in _detect(subscriptions).leaks
    )
    debit_orders = [
        _transaction(
            f"debit-{month}",
            "450",
            date(2026, month, 3),
            merchant="GYM",
            category="Health",
            description="DEBIT ORDER GYM",
        )
        for month in (7, 8, 9)
    ]
    assert all(
        item.evidence.get("finding_focus") != "interest_charges"
        for item in _detect(debit_orders).leaks
    )


def test_overdraft_fees_stay_separate_from_other_bank_fees() -> None:
    fees = _monthly_fees("overdraft", "OVERDRAFT FEE")
    leak = next(item for item in _detect(fees).leaks if item.leak_type == "bank_fee_leak")
    assert leak.evidence["finding_focus"] == "overdraft_fee_pattern"
    assert leak.evidence["overdraft_fee_count"] == 3
    assert leak.evidence["overdraft_fee_total"] == Decimal("45")
    assert leak.evidence["completed_month_count"] == 3
    assert leak.description == "Repeated overdraft fees were observed and may warrant review."
    assert leak.evidence.get("finding_focus") != "foreign_transaction_fee"
    assert leak.evidence.get("finding_focus") != "monthly_banking_fee_trend"
    assert leak.evidence.get("finding_focus") != "interest_charges"

    for description in (
        "MONTHLY ACCOUNT FEE",
        "INSUFFICIENT FUNDS FEE",
        "ATM FEE",
        "FOREIGN TRANSACTION FEE",
    ):
        rows = _monthly_fees(description.lower().replace(" ", "-"), description)
        assert all(
            item.evidence.get("finding_focus") != "overdraft_fee_pattern"
            for item in _detect(rows).leaks
        )

    low_confidence = _monthly_fees("low-overdraft", "OVERDRAFT CHARGE", confidence=0.35)
    assert all(
        item.evidence.get("finding_focus") != "overdraft_fee_pattern"
        for item in _detect(low_confidence).leaks
    )

    copied = []
    for month in (7, 8, 9):
        when = date(2026, month, 30 if month == 9 else 2)
        copied.append(
            _transaction(
                f"od-copy-{month}",
                "15",
                when,
                merchant=None,
                category="Bank Fees",
                transaction_class="bank_fee",
                description="OVERDRAFT FEE",
            )
        )
        copied.append(
            _transaction(
                f"od-extra-{month}",
                "15",
                when,
                merchant=None,
                category="Bank Fees",
                transaction_class="bank_fee",
                description="OVERDRAFT FEE",
            )
        )
    assert all(
        item.evidence.get("finding_focus") != "overdraft_fee_pattern"
        for item in _detect(copied).leaks
    )


def test_insufficient_funds_charges_stay_separate_from_other_fees() -> None:
    fees = _monthly_fees("nsf", "INSUFFICIENT FUNDS FEE")
    leak = next(item for item in _detect(fees).leaks if item.leak_type == "bank_fee_leak")
    assert leak.evidence["finding_focus"] == "insufficient_funds_charges"
    assert leak.evidence["insufficient_funds_fee_count"] == 3
    assert leak.evidence["insufficient_funds_fee_total"] == Decimal("45")
    assert leak.evidence["completed_month_count"] == 3
    assert leak.evidence["bank_fee_transaction_count"] == 3
    assert leak.evidence["monthly_average_fee"] == Decimal("15")
    assert leak.description == (
        "Repeated insufficient-funds charges were observed and may warrant review."
    )
    assert leak.evidence.get("finding_focus") != "overdraft_fee_pattern"
    assert leak.evidence.get("finding_focus") != "interest_charges"
    assert "avoid" not in leak.description.lower()

    for description in (
        "MONTHLY ACCOUNT FEE",
        "OVERDRAFT FEE",
        "OVERDRAFT INTEREST",
        "ATM FEE",
        "FOREIGN TRANSACTION FEE",
        "DEBIT ORDER UNPAID",
    ):
        rows = _monthly_fees(
            description.lower().replace(" ", "-"),
            description,
            transaction_class="bank_fee" if "FEE" in description or "INTEREST" in description else "spending",
            category="Bank Fees" if "FEE" in description or "INTEREST" in description else "Transfers",
            merchant=None if "FEE" in description or "INTEREST" in description else "GYM",
        )
        assert all(
            item.evidence.get("finding_focus") != "insufficient_funds_charges"
            for item in _detect(rows).leaks
        )

    low_confidence = _monthly_fees("low-nsf", "NSF FEE", confidence=0.35)
    assert all(
        item.evidence.get("finding_focus") != "insufficient_funds_charges"
        for item in _detect(low_confidence).leaks
    )

    copied = []
    for month in (7, 8, 9):
        when = date(2026, month, 30 if month == 9 else 2)
        for suffix in ("a", "b"):
            copied.append(
                _transaction(
                    f"nsf-copy-{month}-{suffix}",
                    "15",
                    when,
                    merchant=None,
                    category="Bank Fees",
                    transaction_class="bank_fee",
                    description="INSUFFICIENT FUNDS FEE",
                )
            )
    assert all(
        item.evidence.get("finding_focus") != "insufficient_funds_charges"
        for item in _detect(copied).leaks
    )


def test_credit_utilisation_is_not_inferred_without_limit_evidence() -> None:
    assert "credit_limit" not in FeatureTransaction.__dataclass_fields__
    assert "available_credit" not in FeatureTransaction.__dataclass_fields__
    assert "credit_balance" not in FeatureTransaction.__dataclass_fields__
    purchases = [
        _transaction(
            f"card-{month}",
            "2500",
            date(2026, month, 30 if month == 9 else 8),
            merchant="WOOLWORTHS",
            category="Groceries",
            description="CREDIT CARD PURCHASE WOOLWORTHS",
        )
        for month in (7, 8, 9)
    ]
    interest = _monthly_fees("credit-interest", "INTEREST CHARGED")
    overdraft = _monthly_fees("credit-overdraft", "OVERDRAFT FEE")
    for rows in (purchases, interest, overdraft):
        assert all(
            item.evidence.get("finding_focus") != "credit_utilisation_warning"
            for item in _detect(rows).leaks
        )


def test_unused_insurance_is_not_inferred_from_premium_payments() -> None:
    assert "claim" not in FeatureTransaction.__dataclass_fields__
    assert "product_usage" not in FeatureTransaction.__dataclass_fields__
    premiums = [
        _transaction(
            f"out-{month}",
            "640",
            date(2026, month, 1),
            merchant="OUTSURANCE",
            category="Insurance",
            description="OUTSURANCE INSURANCE",
        )
        for month in (7, 8, 9, 10)
    ]
    other_product = [
        _transaction(
            f"san-{month}",
            "410",
            date(2026, month, 1),
            merchant="SANTAM",
            category="Insurance",
            description="SANTAM INSURANCE",
        )
        for month in (7, 8, 9, 10)
    ]
    low_confidence = [
        _transaction(
            f"low-out-{month}",
            "640",
            date(2026, month, 1),
            merchant="OUTSURANCE",
            category="Insurance",
            description="OUTSURANCE INSURANCE",
            confidence=0.35,
        )
        for month in (7, 8, 9, 10)
    ]
    for rows in (premiums, other_product, premiums + other_product, low_confidence):
        snapshot = build_financial_features("user-a", rows)
        behaviours = analyze_behaviour(snapshot)
        leaks = detect_leaks(snapshot, behaviours)
        assert all(
            item.evidence.get("finding_focus") != "unused_insurance_product"
            for item in (*behaviours.observations, *leaks.leaks)
        )


def test_missing_refund_is_not_inferred_without_an_expected_refund() -> None:
    assert "expected_refund" not in FeatureTransaction.__dataclass_fields__
    assert "refund_reference" not in FeatureTransaction.__dataclass_fields__
    purchase = [
        _transaction("buy", "186.40", date(2026, 7, 18), merchant="WOOLWORTHS", category="Groceries"),
        _transaction("later", "80", date(2026, 9, 30), merchant="CHECKERS", category="Groceries"),
    ]
    refunded = [
        _transaction("buy", "186.40", date(2026, 7, 18), merchant="WOOLWORTHS", category="Groceries"),
        _transaction(
            "refund",
            "186.40",
            date(2026, 7, 20),
            merchant="WOOLWORTHS",
            category="Groceries",
            transaction_type="credit",
            description="REFUND WOOLWORTHS",
        ),
        _transaction("later", "80", date(2026, 9, 30), merchant="CHECKERS", category="Groceries"),
    ]
    duplicate = [
        _transaction("dup-a", "186.40", date(2026, 7, 18), merchant="WOOLWORTHS", category="Groceries"),
        _transaction("dup-b", "186.40", date(2026, 7, 18), merchant="WOOLWORTHS", category="Groceries"),
        _transaction("later", "80", date(2026, 9, 30), merchant="CHECKERS", category="Groceries"),
    ]
    low_confidence = [
        _transaction(
            "low-buy",
            "186.40",
            date(2026, 7, 18),
            merchant="WOOLWORTHS",
            category="Groceries",
            confidence=0.35,
        ),
        _transaction("later", "80", date(2026, 9, 30), merchant="CHECKERS", category="Groceries"),
    ]
    for rows in (purchase, refunded, duplicate, low_confidence):
        detected = _detect(rows)
        assert all(item.evidence.get("finding_focus") != "missing_refund" for item in detected.leaks)
        assert all(item.evidence.get("finding_focus") != "merchant_billing_error" for item in detected.leaks)
    duplicate_leak = next(
        item for item in _detect(duplicate).leaks if item.leak_type == "duplicate_payment_leak"
    )
    assert duplicate_leak.evidence["finding_focus"] == "duplicate_merchant_payment"


def test_cashback_is_not_inferred_without_an_expected_reward() -> None:
    assert "cashback_amount" not in FeatureTransaction.__dataclass_fields__
    assert "cashback_rate" not in FeatureTransaction.__dataclass_fields__
    purchase = [
        _transaction("buy", "500", date(2026, 7, 8), merchant="WOOLWORTHS", category="Groceries"),
        _transaction("later", "80", date(2026, 9, 30), merchant="CHECKERS", category="Groceries"),
    ]
    refund = [
        _transaction("buy", "500", date(2026, 7, 8), merchant="WOOLWORTHS", category="Groceries"),
        _transaction(
            "refund",
            "500",
            date(2026, 7, 12),
            merchant="WOOLWORTHS",
            category="Groceries",
            transaction_type="credit",
            description="REFUND WOOLWORTHS",
        ),
        _transaction("later", "80", date(2026, 9, 30), merchant="CHECKERS", category="Groceries"),
    ]
    loyalty = [
        _transaction(
            "points",
            "40",
            date(2026, 8, 2),
            merchant="DISCOVERY",
            category="Other Income",
            transaction_class="income",
            transaction_type="credit",
            description="VITALITY POINTS",
        ),
        _transaction("later", "80", date(2026, 9, 30), merchant="CHECKERS", category="Groceries"),
    ]
    interest = [
        _transaction(
            "interest",
            "12",
            date(2026, 8, 2),
            merchant=None,
            category="Other Income",
            transaction_class="income",
            transaction_type="credit",
            description="INTEREST RECEIVED",
        ),
        _transaction("later", "80", date(2026, 9, 30), merchant="CHECKERS", category="Groceries"),
    ]
    low_confidence = [
        _transaction(
            "low-buy",
            "500",
            date(2026, 7, 8),
            merchant="WOOLWORTHS",
            category="Groceries",
            confidence=0.35,
        ),
        _transaction("later", "80", date(2026, 9, 30), merchant="CHECKERS", category="Groceries"),
    ]
    for rows in (purchase, refund, loyalty, interest, low_confidence):
        assert all(
            item.evidence.get("finding_focus") != "cashback_not_received"
            for item in _detect(rows).leaks
        )


def test_incorrect_merchant_charge_is_not_inferred_without_a_reference() -> None:
    assert "reference_amount" not in FeatureTransaction.__dataclass_fields__
    assert "billing_correction" not in FeatureTransaction.__dataclass_fields__
    purchase = [
        _transaction("large", "4200", date(2026, 7, 18), merchant="WOOLWORTHS", category="Groceries"),
        _transaction("later", "80", date(2026, 9, 30), merchant="CHECKERS", category="Groceries"),
    ]
    low_confidence = [
        _transaction(
            "low-large",
            "4200",
            date(2026, 7, 18),
            merchant="WOOLWORTHS",
            category="Groceries",
            confidence=0.35,
        ),
        _transaction("later", "80", date(2026, 9, 30), merchant="CHECKERS", category="Groceries"),
    ]
    steers = [
        _transaction("steers-1", "120", date(2026, 7, 12), merchant="STEERS", category="Fast Food"),
        _transaction("steers-2", "160", date(2026, 8, 12), merchant="STEERS", category="Fast Food"),
        _transaction("steers-3", "220", date(2026, 9, 12), merchant="STEERS", category="Fast Food"),
        _transaction("pad", "80", date(2026, 9, 30), merchant="CHECKERS", category="Groceries"),
    ]
    duplicate = [
        _transaction("dup-a", "186.40", date(2026, 7, 18), merchant="WOOLWORTHS", category="Groceries"),
        _transaction("dup-b", "186.40", date(2026, 7, 18), merchant="WOOLWORTHS", category="Groceries"),
        _transaction("later", "80", date(2026, 9, 30), merchant="CHECKERS", category="Groceries"),
    ]
    for rows in (purchase, low_confidence, steers, duplicate):
        snapshot = build_financial_features("user-a", rows)
        behaviours = analyze_behaviour(snapshot)
        leaks = detect_leaks(snapshot, behaviours)
        findings = (*behaviours.observations, *leaks.leaks)
        assert all(item.evidence.get("finding_focus") != "incorrect_merchant_charge" for item in findings)
        assert all(item.evidence.get("finding_focus") != "merchant_billing_error" for item in findings)
    price = next(
        item
        for item in analyze_behaviour(build_financial_features("user-a", steers)).observations
        if item.behavior_type == "price_increase_pattern"
    )
    assert price.evidence["finding_focus"] == "merchant_price_increase"
    duplicate_leak = next(
        item for item in _detect(duplicate).leaks if item.leak_type == "duplicate_payment_leak"
    )
    assert duplicate_leak.evidence["finding_focus"] == "duplicate_merchant_payment"


def test_better_account_is_not_recommended_without_product_comparison() -> None:
    assert "alternative_account_fee" not in FeatureTransaction.__dataclass_fields__
    assert "better_account_recommendation" not in get_args(RecommendationType)
    fees = _monthly_fees("account", "MONTHLY ACCOUNT FEE", amount="25")
    fees[-1] = _transaction(
        "account-9",
        "80",
        date(2026, 9, 30),
        merchant=None,
        category="Bank Fees",
        transaction_class="bank_fee",
        description="MONTHLY ACCOUNT FEE",
    )
    snapshot = build_financial_features("user-a", fees)
    behaviours = analyze_behaviour(snapshot)
    leaks = detect_leaks(snapshot, behaviours)
    findings = (*behaviours.observations, *leaks.leaks)
    assert all(item.evidence.get("finding_focus") != "better_account_recommendation" for item in findings)
    reasoning = analyze_financial_reasoning(snapshot, behaviours, leaks)
    assert all(item.title != "Better account recommendation" for item in reasoning.analyses)
    low_confidence = _monthly_fees("low-account", "MONTHLY ACCOUNT FEE", amount="80", confidence=0.35)
    low_snapshot = build_financial_features("user-a", low_confidence)
    low_behaviours = analyze_behaviour(low_snapshot)
    low_leaks = detect_leaks(low_snapshot, low_behaviours)
    assert all(
        item.evidence.get("finding_focus") != "better_account_recommendation"
        for item in (*low_behaviours.observations, *low_leaks.leaks)
    )


def test_stable_monthly_account_fees_do_not_produce_bank_fee_leak() -> None:
    transactions = [
        _transaction(
            f"fee-{month}",
            "69",
            date(2026, month, 2),
            merchant=None,
            category="Bank Fees",
            transaction_class="bank_fee",
            description="MONTHLY ACCOUNT FEE",
        )
        for month in (7, 8, 9)
    ]
    assert "bank_fee_leak" not in _types(transactions)


def test_repeated_sms_banking_fees_produce_bank_fee_leak() -> None:
    transactions = []
    for day in (2, 3):
        transactions.append(
            _transaction(
                f"sms-7-{day}",
                "3",
                date(2026, 7, day),
                merchant=None,
                category="Bank Fees",
                transaction_class="bank_fee",
                description="SMS NOTIFICATION FEE",
            )
        )
    for day in range(2, 6):
        transactions.append(
            _transaction(
                f"sms-8-{day}",
                "3",
                date(2026, 8, day),
                merchant=None,
                category="Bank Fees",
                transaction_class="bank_fee",
                description="SMS NOTIFICATION FEE",
            )
        )
    for day in range(2, 8):
        transactions.append(
            _transaction(
                f"sms-9-{day}",
                "3",
                date(2026, 9, day),
                merchant=None,
                category="Bank Fees",
                transaction_class="bank_fee",
                description="SMS NOTIFICATION FEE",
            )
        )
    result = _detect(transactions)
    leak = next(item for item in result.leaks if item.leak_type == "bank_fee_leak")
    assert leak.title == "Potential SMS banking charge burden"
    assert leak.evidence["finding_focus"] == "sms_banking"
    assert leak.evidence["sms_fee_total"] == Decimal("36")
    assert "recurring_payment_leak" not in {item.leak_type for item in result.leaks}


_FEE_SUBTYPE_REFS = {
    "fees.balance_enquiry_fee_total",
    "fees.sms_fee_total",
    "fees.immediate_payment_fee_total",
    "fees.foreign_transaction_fee_total",
    "fees.foreign_transaction_fee_count",
    "fees.card_fee_total",
    "fees.card_fee_transaction_count",
    "fees.interest_charge_total",
    "fees.interest_charge_count",
}


def test_bank_fee_feature_refs_match_the_finding_focus() -> None:
    cases = {
        "sms_banking": (
            _monthly_fees("sms-ref", "SMS NOTIFICATION FEE"),
            {"fees.sms_fee_total"},
        ),
        "atm_balance_enquiry": (
            _monthly_fees("enquiry-ref", "BALANCE ENQUIRY FEE"),
            {"fees.balance_enquiry_fee_total"},
        ),
        "immediate_payment_fee": (
            [
                _transaction(
                    f"immediate-ref-{month}-{index}",
                    "8",
                    date(
                        2026,
                        month,
                        (30 if month == 7 else 31)
                        if index == count - 1
                        else min(2 + index, 27),
                    ),
                    merchant=None,
                    category="Bank Fees",
                    transaction_class="bank_fee",
                    description="IMMEDIATE PAYMENT FEE",
                )
                for month, count in ((7, 4), (8, 8))
                for index in range(count)
            ],
            {"fees.immediate_payment_fee_total"},
        ),
        "foreign_transaction_fee": (
            _monthly_fees("fx-ref", "FOREIGN TRANSACTION FEE"),
            {
                "fees.foreign_transaction_fee_total",
                "fees.foreign_transaction_fee_count",
            },
        ),
        "recurring_merchant_fee_change": (
            [
                _transaction(
                    f"card-ref-{month}",
                    amount,
                    date(2026, month, 30 if month == 9 else 2),
                    merchant=None,
                    category="Bank Fees",
                    transaction_class="bank_fee",
                    description="MONTHLY CARD FEE",
                )
                for month, amount in ((7, "25"), (8, "35"), (9, "45"))
            ],
            {"fees.card_fee_total", "fees.card_fee_transaction_count"},
        ),
    }
    for focus, (transactions, required) in cases.items():
        leak = next(
            item for item in _detect(transactions).leaks if item.leak_type == "bank_fee_leak"
        )
        refs = set(leak.supporting_feature_references)
        assert leak.evidence["finding_focus"] == focus
        assert required <= refs
        assert "fees" in refs
        assert "months[].bank_fee_total" in refs
        assert "spending_profile.bank_fee_ratio" in refs
        assert refs.isdisjoint(_FEE_SUBTYPE_REFS - required)


def test_generic_account_fees_are_not_classified_as_sms_banking() -> None:
    snapshot = build_financial_features(
        "user-a",
        [
            _transaction(
                "account-fee",
                "50",
                date(2026, 7, 2),
                merchant=None,
                category="Bank Fees",
                transaction_class="bank_fee",
                description="MONTHLY ACCOUNT FEE",
            ),
            _transaction(
                "push-notification",
                "3",
                date(2026, 7, 3),
                merchant=None,
                category="Bank Fees",
                transaction_class="bank_fee",
                description="PUSH NOTIFICATION FEE",
            ),
        ],
    )
    assert snapshot.fees.sms_fee_total is None
    assert snapshot.fees.account_fee_total == Decimal("50")


def test_single_small_sms_fee_does_not_produce_bank_fee_leak() -> None:
    transactions = [
        _transaction(
            "sms-1",
            "3",
            date(2026, 7, 2),
            merchant=None,
            category="Bank Fees",
            transaction_class="bank_fee",
            description="SMS NOTIFICATION FEE",
        )
    ]
    assert "bank_fee_leak" not in _types(transactions)


def test_atm_withdrawal_fee_descriptions_are_classified() -> None:
    snapshot = build_financial_features(
        "user-a",
        [
            _transaction(
                "atm-fee",
                "20",
                date(2026, 7, 2),
                merchant=None,
                category="Bank Fees",
                transaction_class="bank_fee",
                description="ATM WITHDRAWAL FEE",
            )
        ],
    )
    assert snapshot.cash.atm_fee_total == Decimal("20")
    assert snapshot.fees.atm_fee_total == Decimal("20")


def test_cash_dependency_promotes_to_cash_usage_leak_without_atm_fees() -> None:
    transactions = [
        _transaction("cash-1", "200", date(2026, 7, 1), merchant=None, category="Cash Withdrawal"),
        _transaction("cash-2", "200", date(2026, 8, 1), merchant=None, category="Cash Withdrawal"),
        _transaction("cash-3", "200", date(2026, 9, 30), merchant=None, category="Cash Withdrawal"),
        _transaction("digital-1", "200", date(2026, 7, 3), merchant="CHECKERS", category="Groceries"),
        _transaction("digital-2", "200", date(2026, 8, 3), merchant="CHECKERS", category="Groceries"),
        _transaction("digital-3", "200", date(2026, 9, 3), merchant="CHECKERS", category="Groceries"),
    ]
    leak = next(item for item in _detect(transactions).leaks if item.leak_type == "cash_usage_leak")
    assert leak.impact_kind == "estimated"
    assert leak.evidence["finding_focus"] == "cash_dependency"
    assert leak.evidence["cash_withdrawal_share"] == Decimal("0.5")
    assert leak.evidence["atm_fee_total"] is None
    assert leak.description == (
        "Cash withdrawals represent a meaningful share of observed spending."
    )


def test_atm_withdrawal_fee_stacking_uses_fee_focus_not_cash_dependency_title() -> None:
    transactions = [
        _transaction("cash-1", "200", date(2026, 7, 5), merchant=None, category="Cash Withdrawal"),
        _transaction("fee-1", "20", date(2026, 7, 5), merchant=None, category="Bank Fees", transaction_class="bank_fee", description="ATM WITHDRAWAL FEE"),
        _transaction("cash-2", "300", date(2026, 8, 5), merchant=None, category="Cash Withdrawal"),
        _transaction("fee-2", "20", date(2026, 8, 5), merchant=None, category="Bank Fees", transaction_class="bank_fee", description="ATM WITHDRAWAL FEE"),
        _transaction("cash-3", "400", date(2026, 9, 30), merchant=None, category="Cash Withdrawal"),
        _transaction("fee-3", "20", date(2026, 9, 30), merchant=None, category="Bank Fees", transaction_class="bank_fee", description="ATM WITHDRAWAL FEE"),
    ]
    leak = next(item for item in _detect(transactions).leaks if item.leak_type == "cash_usage_leak")
    assert leak.title == "Potential ATM withdrawal fee stacking"
    assert leak.evidence["finding_focus"] == "atm_withdrawal_fee_stacking"
    assert leak.evidence["atm_fee_count"] == 3
    assert "recurring_payment_leak" not in _types(transactions)


def test_duplicate_cash_withdrawals_do_not_inflate_cash_share() -> None:
    transactions = [
        _transaction("cash-1", "100", date(2026, 7, 1), merchant=None, category="Cash Withdrawal", description="ATM CASH WITHDRAWAL"),
        _transaction("cash-1-copy", "100", date(2026, 7, 1), merchant=None, category="Cash Withdrawal", description="ATM CASH WITHDRAWAL"),
        _transaction("cash-2", "100", date(2026, 8, 1), merchant=None, category="Cash Withdrawal", description="ATM CASH WITHDRAWAL"),
        _transaction("cash-2-copy", "100", date(2026, 8, 1), merchant=None, category="Cash Withdrawal", description="ATM CASH WITHDRAWAL"),
        _transaction("cash-3", "100", date(2026, 9, 30), merchant=None, category="Cash Withdrawal", description="ATM CASH WITHDRAWAL"),
        _transaction("cash-3-copy", "100", date(2026, 9, 30), merchant=None, category="Cash Withdrawal", description="ATM CASH WITHDRAWAL"),
        _transaction("shop-1", "1000", date(2026, 7, 3), merchant="CHECKERS", category="Groceries"),
        _transaction("shop-2", "1000", date(2026, 8, 3), merchant="CHECKERS", category="Groceries"),
        _transaction("shop-3", "1000", date(2026, 9, 29), merchant="CHECKERS", category="Groceries"),
    ]
    snapshot = build_financial_features("user-a", transactions)
    assert snapshot.cash.cash_withdrawal_count == 3
    assert snapshot.cash.cash_withdrawal_total == Decimal("300")
    spending_total = snapshot.spending_profile.total_spending
    assert spending_total is not None
    assert snapshot.cash.cash_withdrawal_total / spending_total < Decimal("0.15")
    assert "cash_dependency" not in {
        item.behavior_type for item in analyze_behaviour(snapshot).observations
    }
    fees = [
        _transaction("fee-1", "20", date(2026, 7, 2), merchant=None, category="Bank Fees", transaction_class="bank_fee", description="ACCOUNT FEE"),
        _transaction("fee-2", "20", date(2026, 8, 2), merchant=None, category="Bank Fees", transaction_class="bank_fee", description="ACCOUNT FEE"),
        _transaction("fee-3", "20", date(2026, 9, 29), merchant=None, category="Bank Fees", transaction_class="bank_fee", description="ACCOUNT FEE"),
    ]
    fee_snapshot = build_financial_features("user-a", fees)
    assert fee_snapshot.cash.cash_withdrawal_count == 0
    assert "cash_dependency" not in {
        item.behavior_type for item in analyze_behaviour(fee_snapshot).observations
    }
    subscription = [
        _transaction(f"netflix-{index}", "99", when, merchant="NETFLIX", category="Subscriptions")
        for index, when in enumerate((date(2026, 7, 3), date(2026, 8, 3), date(2026, 9, 3)))
    ]
    subscription_types = {
        item.behavior_type for item in analyze_behaviour(build_financial_features("user-a", subscription)).observations
    }
    assert "recurring_payment_pattern" in subscription_types
    assert "cash_dependency" not in subscription_types


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
    assert leak.evidence["finding_focus"] == "duplicate_merchant_payment"
    assert "transaction_ids" not in leak.evidence


def test_duplicate_merchant_payment_rejects_lookalikes_and_does_not_inflate_counts() -> None:
    later = _transaction("later", "420", date(2026, 9, 30), merchant="CHECKERS", category="Groceries")
    different_days = [
        _transaction("day-a", "186.40", date(2026, 7, 18), merchant="WOOLWORTHS", category="Groceries"),
        _transaction("day-b", "186.40", date(2026, 7, 19), merchant="WOOLWORTHS", category="Groceries"),
        later,
    ]
    assert "duplicate_payment_leak" not in _types(different_days)

    different_amounts = [
        _transaction("amt-a", "186.40", date(2026, 7, 18), merchant="WOOLWORTHS", category="Groceries"),
        _transaction("amt-b", "210.00", date(2026, 7, 18), merchant="WOOLWORTHS", category="Groceries"),
        later,
    ]
    assert "duplicate_payment_leak" not in _types(different_amounts)

    different_merchants = [
        _transaction("shop-a", "186.40", date(2026, 7, 18), merchant="WOOLWORTHS", category="Groceries"),
        _transaction("shop-b", "186.40", date(2026, 7, 18), merchant="CHECKERS", category="Groceries"),
        later,
    ]
    assert "duplicate_payment_leak" not in _types(different_merchants)

    low_confidence = [
        _transaction(
            "low-a",
            "186.40",
            date(2026, 7, 18),
            merchant="WOOLWORTHS",
            category="Groceries",
            confidence=0.35,
        ),
        _transaction(
            "low-b",
            "186.40",
            date(2026, 7, 18),
            merchant="WOOLWORTHS",
            category="Groceries",
            confidence=0.35,
        ),
        later,
    ]
    assert "duplicate_payment_leak" not in _types(low_confidence)

    airtime_copies = [
        _transaction(
            "air-a",
            "40",
            date(2026, 7, 1),
            merchant="MTN",
            category="Airtime & Data",
            description="PREPAID AIRTIME MTN",
        ),
        _transaction(
            "air-b",
            "40",
            date(2026, 7, 1),
            merchant="MTN",
            category="Airtime & Data",
            description="PREPAID AIRTIME MTN",
        ),
        _transaction("later", "100", date(2026, 9, 30), merchant="CHECKERS", category="Groceries"),
    ]
    snapshot = build_financial_features("user-a", airtime_copies)
    airtime = next(item for item in snapshot.categories if item.category_name == "Airtime & Data")
    assert airtime.airtime_transaction_count == 1
    assert airtime.airtime_total_amount == Decimal("40")
    duplicate = next(
        item for item in _detect(airtime_copies).leaks if item.leak_type == "duplicate_payment_leak"
    )
    assert duplicate.evidence["finding_focus"] == "duplicate_merchant_payment"
    assert duplicate.evidence["transaction_count_in_group"] == 2

    price = [
        _transaction(f"steers-{index}", amount, date(2026, 7 + index, 12), merchant="STEERS", category="Restaurants")
        for index, amount in enumerate(("120", "160", "220"))
    ]
    price_result = _detect(price)
    assert "duplicate_payment_leak" not in {item.leak_type for item in price_result.leaks}
    behaviours = analyze_behaviour(build_financial_features("user-a", price))
    merchant_price = next(
        item for item in behaviours.observations if item.behavior_type == "price_increase_pattern"
    )
    assert merchant_price.evidence["finding_focus"] == "merchant_price_increase"
    assert merchant_price.evidence.get("finding_focus") != "duplicate_merchant_payment"


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
