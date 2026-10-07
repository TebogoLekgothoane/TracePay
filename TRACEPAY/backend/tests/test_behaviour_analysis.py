from datetime import date, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient

from app.auth import require_supabase_user
from app.main import app
from categorisation.models import CategorisationResult
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.behaviour_report import render_behaviour_report
from leak_intelligence.engine import build_financial_features
from leak_intelligence.leak_engine import detect_leaks
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
        _transaction("steers-1", "120", date(2026, 8, 1), merchant="STEERS", category="Restaurants"),
        _transaction("steers-2", "160", date(2026, 9, 1), merchant="STEERS", category="Restaurants"),
        _transaction("steers-3", "220", date(2026, 10, 1), merchant="STEERS", category="Restaurants"),
        _transaction("coffee-1", "50", date(2026, 10, 2), merchant="COFFEE", category="Restaurants"),
        _transaction("coffee-2", "50", date(2026, 10, 2), merchant="COFFEE", category="Restaurants"),
    ]
    result = analyze_behaviour(build_financial_features("user-a", transactions))
    types = {item.behavior_type for item in result.observations}
    assert "recurring_payment_pattern" in types
    assert "price_increase_pattern" in types
    price = next(item for item in result.observations if item.behavior_type == "price_increase_pattern")
    assert price.evidence.get("finding_focus") == "merchant_price_increase"
    duplicate = next(item for item in result.observations if item.behavior_type == "duplicate_payment_pattern")
    assert duplicate.evidence["candidate_only"] is True
    assert "transaction_ids" not in duplicate.evidence
    assert all("leak" not in item.description.lower() for item in result.observations)


def test_convenience_store_habit_is_distinct_from_groceries_fast_food_and_coffee() -> None:
    stores = [
        _transaction(
            f"spar-{index}",
            "60",
            date(2026, 7, 4 + index),
            merchant="SPAR EXPRESS",
            category="Groceries",
            description="POS PURCHASE SPAR EXPRESS SANDTON",
        )
        for index in range(4)
    ]
    observation = next(
        item
        for item in analyze_behaviour(build_financial_features("user-a", stores)).observations
        if item.behavior_type == "spending_habit_pattern"
    )
    assert observation.evidence["finding_focus"] == "convenience_store_spending"
    assert observation.evidence["convenience_store_transaction_count"] == 4

    assert "spending_habit_pattern" not in _types(stores[:1])

    low_confidence = [
        _transaction(
            f"low-spar-{index}",
            "60",
            date(2026, 7, 4 + index),
            merchant="SPAR EXPRESS",
            category="Groceries",
            description="POS PURCHASE SPAR EXPRESS",
            confidence=0.35,
        )
        for index in range(4)
    ]
    assert "spending_habit_pattern" not in _types(low_confidence)

    groceries = [
        _transaction(f"checkers-{index}", "200", date(2026, 7, index + 1), merchant="CHECKERS", category="Groceries")
        for index in range(4)
    ]
    assert "spending_habit_pattern" not in _types(groceries)

    duplicates = [
        _transaction("spar-a", "60", date(2026, 7, 4), merchant="SPAR EXPRESS", category="Groceries", description="SPAR EXPRESS"),
        _transaction("spar-b", "60", date(2026, 7, 4), merchant="SPAR EXPRESS", category="Groceries", description="SPAR EXPRESS"),
        _transaction("spar-c", "60", date(2026, 7, 6), merchant="SPAR EXPRESS", category="Groceries", description="SPAR EXPRESS"),
        _transaction("spar-d", "60", date(2026, 7, 6), merchant="SPAR EXPRESS", category="Groceries", description="SPAR EXPRESS"),
    ]
    assert "spending_habit_pattern" not in _types(duplicates)


def _focuses(transactions: list[FeatureTransaction]) -> set[str | None]:
    return {
        observation.evidence.get("finding_focus")
        for observation in analyze_behaviour(
            build_financial_features("user-a", transactions)
        ).observations
    }


def test_adjacent_spending_patterns_are_not_impulse_findings() -> None:
    assert "impulse_spending_pattern" not in _focuses(
        [_transaction("one", "80", date(2026, 9, 6), merchant="PICK N PAY", category="Shopping")]
    )

    low_confidence = [
        _transaction(
            f"low-{index}",
            "80",
            date(2026, 9, 6 + index),
            merchant="PICK N PAY",
            category="Shopping",
            confidence=0.35,
        )
        for index in range(8)
    ]
    assert "impulse_spending_pattern" not in _focuses(low_confidence)

    increased = [
        _transaction("jul", "100", date(2026, 7, 1), category="Shopping"),
        _transaction("aug", "150", date(2026, 8, 1), category="Shopping"),
        _transaction("sep", "400", date(2026, 9, 30), category="Shopping"),
    ]
    increased_types = _types(increased)
    assert "spending_increase" in increased_types
    assert "impulse_spending_pattern" not in _focuses(increased)

    weekend_only = [
        _transaction(f"weekend-{index}", "100", date(2026, 8, 1) + timedelta(days=index * 7), category="Shopping")
        for index in range(10)
    ]
    assert "weekend_spending_pattern" in _types(weekend_only)
    assert "impulse_spending_pattern" not in _focuses(weekend_only)

    payday = []
    for index, income_day in enumerate((date(2026, 8, 25), date(2026, 9, 25), date(2026, 10, 25))):
        payday.append(
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
            payday.append(
                _transaction(
                    f"after-pay-{index}-{payment}",
                    str(200 + payment),
                    income_day + timedelta(days=payment % 3),
                    merchant="PICK N PAY",
                    category="Shopping",
                )
            )
    assert "payday_spending_pattern" in _types(payday)
    assert "impulse_spending_pattern" not in _focuses(payday)

    coffees = [
        _transaction(
            f"coffee-{index}",
            "45",
            date(2026, 7, 1) + timedelta(days=index * 3),
            merchant="SEATTLE COFFEE",
            category="Restaurants",
            description="POS PURCHASE SEATTLE COFFEE",
        )
        for index in range(4)
    ]
    assert _focuses(coffees) >= {"coffee_spending_habit"}
    assert "impulse_spending_pattern" not in _focuses(coffees)

    stores = [
        _transaction(
            f"spar-{index}",
            "60",
            date(2026, 7, 4 + index),
            merchant="SPAR EXPRESS",
            category="Groceries",
            description="POS PURCHASE SPAR EXPRESS SANDTON",
        )
        for index in range(4)
    ]
    assert "convenience_store_spending" in _focuses(stores)
    assert "impulse_spending_pattern" not in _focuses(stores)

    fast_food = [
        _transaction(f"kfc-{index}", "80", date(2026, 7, 1) + timedelta(days=index), merchant="KFC", category="Fast Food")
        for index in range(4)
    ]
    assert "impulse_spending_pattern" not in _focuses(fast_food)

    subscription = [
        _transaction(f"netflix-{index}", "99", when, merchant="NETFLIX", category="Subscriptions")
        for index, when in enumerate((date(2026, 7, 3), date(2026, 8, 3), date(2026, 9, 3)))
    ]
    assert "recurring_payment_pattern" in _types(subscription)
    assert "impulse_spending_pattern" not in _focuses(subscription)

    duplicates = [
        _transaction("dup-a", "120", date(2026, 9, 6), merchant="PICK N PAY", category="Shopping"),
        _transaction("dup-b", "120", date(2026, 9, 6), merchant="PICK N PAY", category="Shopping"),
        _transaction("dup-c", "120", date(2026, 9, 7), merchant="PICK N PAY", category="Shopping"),
        _transaction("dup-d", "120", date(2026, 9, 7), merchant="PICK N PAY", category="Shopping"),
    ]
    assert "duplicate_payment_pattern" in _types(duplicates)
    assert "impulse_spending_pattern" not in _focuses(duplicates)


def test_coffee_spending_habit_requires_repeated_coffee_evidence() -> None:
    coffees = [
        _transaction(
            f"coffee-{index}",
            "45",
            date(2026, 7, 1) + timedelta(days=index * 3),
            merchant="SEATTLE COFFEE",
            category="Restaurants",
            description="POS PURCHASE SEATTLE COFFEE",
        )
        for index in range(4)
    ]
    observation = next(
        item
        for item in analyze_behaviour(build_financial_features("user-a", coffees)).observations
        if item.behavior_type == "spending_habit_pattern"
    )
    assert observation.evidence["finding_focus"] == "coffee_spending_habit"
    assert observation.evidence["coffee_transaction_count"] == 4
    assert "unnecessary" in observation.description

    assert "spending_habit_pattern" not in _types(coffees[:1])

    low_confidence = [
        _transaction(
            f"low-{index}",
            "45",
            date(2026, 7, 1) + timedelta(days=index * 3),
            merchant="SEATTLE COFFEE",
            category="Restaurants",
            description="POS PURCHASE SEATTLE COFFEE",
            confidence=0.35,
        )
        for index in range(4)
    ]
    assert "spending_habit_pattern" not in _types(low_confidence)

    fast_food = [
        _transaction(f"kfc-{index}", "80", date(2026, 7, 1) + timedelta(days=index), merchant="KFC", category="Fast Food")
        for index in range(4)
    ]
    assert "spending_habit_pattern" not in _types(fast_food)

    restaurant = [
        _transaction(f"spur-{index}", "180", date(2026, 7, index + 1), merchant="SPUR", category="Restaurants")
        for index in range(4)
    ]
    assert "spending_habit_pattern" not in _types(restaurant)

    convenience = [
        _transaction(
            f"spar-{index}",
            "40",
            date(2026, 7, index + 1),
            merchant="SPAR EXPRESS",
            category="Groceries",
            description="POS PURCHASE SPAR EXPRESS",
        )
        for index in range(4)
    ]
    convenience_focuses = {
        item.evidence.get("finding_focus")
        for item in analyze_behaviour(build_financial_features("user-a", convenience)).observations
    }
    assert "coffee_spending_habit" not in convenience_focuses

    duplicates = [
        _transaction("dup-a", "45", date(2026, 7, 1), merchant="SEATTLE COFFEE", category="Restaurants", description="SEATTLE COFFEE"),
        _transaction("dup-b", "45", date(2026, 7, 1), merchant="SEATTLE COFFEE", category="Restaurants", description="SEATTLE COFFEE"),
        _transaction("dup-c", "45", date(2026, 7, 4), merchant="SEATTLE COFFEE", category="Restaurants", description="SEATTLE COFFEE"),
        _transaction("dup-d", "45", date(2026, 7, 4), merchant="SEATTLE COFFEE", category="Restaurants", description="SEATTLE COFFEE"),
    ]
    assert "spending_habit_pattern" not in _types(duplicates)


def test_debit_order_frequency_change_requires_two_stable_intervals() -> None:
    shifted = [
        _transaction(
            f"gym-{index}",
            "299",
            when,
            merchant="PLANET FITNESS",
            category="Entertainment",
            description="DEBIT ORDER PLANET FITNESS",
        )
        for index, when in enumerate(
            (
                date(2026, 1, 1),
                date(2026, 2, 1),
                date(2026, 3, 1),
                date(2026, 3, 15),
                date(2026, 3, 29),
                date(2026, 4, 12),
            )
        )
    ]
    observation = next(
        item
        for item in analyze_behaviour(build_financial_features("user-a", shifted)).observations
        if item.behavior_type == "frequency_change_pattern"
    )
    assert observation.evidence["finding_focus"] == "debit_order_frequency_change"
    assert observation.evidence["baseline_interval_count"] >= 2
    assert observation.evidence["current_interval_count"] >= 2
    assert "incorrectly" in observation.description

    stable = [
        _transaction(
            f"stable-{index}",
            "299",
            date(2026, 1, 1) + timedelta(days=30 * index),
            merchant="PLANET FITNESS",
            category="Entertainment",
            description="DEBIT ORDER PLANET FITNESS",
        )
        for index in range(6)
    ]
    assert "frequency_change_pattern" not in _types(stable)

    unusual_gap = [
        _transaction(
            f"gap-{index}",
            "299",
            when,
            merchant="PLANET FITNESS",
            category="Entertainment",
            description="DEBIT ORDER PLANET FITNESS",
        )
        for index, when in enumerate(
            (
                date(2026, 1, 1),
                date(2026, 2, 1),
                date(2026, 3, 1),
                date(2026, 4, 1),
                date(2026, 4, 10),
            )
        )
    ]
    assert "frequency_change_pattern" not in _types(unusual_gap)

    short_history = unusual_gap[:3]
    assert "frequency_change_pattern" not in _types(short_history)

    daily = [
        _transaction(
            f"daily-{index}",
            "20",
            date(2026, 1, 1) + timedelta(days=index),
            merchant="PLANET FITNESS",
            category="Entertainment",
            description="DEBIT ORDER PLANET FITNESS",
        )
        for index in range(8)
    ]
    assert "frequency_change_pattern" not in _types(daily)


def test_subscription_and_non_debit_frequency_shifts_are_not_debit_order_findings() -> None:
    dates = (
        date(2026, 1, 1),
        date(2026, 2, 1),
        date(2026, 3, 1),
        date(2026, 3, 15),
        date(2026, 3, 29),
        date(2026, 4, 12),
    )
    subscription = [
        _transaction(
            f"show-{index}",
            "99",
            when,
            merchant="NETFLIX",
            category="Subscriptions",
            description="DEBIT ORDER NETFLIX",
        )
        for index, when in enumerate(dates)
    ]
    assert "frequency_change_pattern" not in _types(subscription)

    grocery = [
        _transaction(f"shop-{index}", "120", when, merchant="CHECKERS", category="Groceries")
        for index, when in enumerate(dates)
    ]
    assert "frequency_change_pattern" not in _types(grocery)


def test_debit_order_amount_increase_is_distinct_from_generic_price_increase() -> None:
    transactions = [
        _transaction(
            f"muni-{index}",
            amount,
            date(2026, 7 + index, 1),
            merchant="CITY OF JHB",
            category="Other",
            description="DEBIT ORDER CITY OF JHB",
        )
        for index, amount in enumerate(("800", "850", "920", "990"))
    ]
    price = next(
        item
        for item in analyze_behaviour(build_financial_features("user-a", transactions)).observations
        if item.behavior_type == "price_increase_pattern"
    )
    assert price.evidence["finding_focus"] == "debit_order_amount_increase"
    assert price.evidence["first_amount"] == Decimal("800")
    assert price.evidence["latest_amount"] == Decimal("990")
    assert price.evidence["debit_order_transaction_count"] == 4


def test_subscription_price_creep_requires_recurring_subscription_merchant() -> None:
    transactions = [
        _transaction(f"netflix-{index}", amount, when, merchant="NETFLIX", category="Subscriptions")
        for index, (amount, when) in enumerate(
            (
                ("199", date(2026, 7, 1)),
                ("249", date(2026, 8, 1)),
                ("299", date(2026, 9, 1)),
                ("349", date(2026, 10, 1)),
            )
        )
    ]
    price = next(
        item
        for item in analyze_behaviour(build_financial_features("user-a", transactions)).observations
        if item.behavior_type == "price_increase_pattern"
    )
    assert price.evidence["finding_focus"] == "subscription_price_creep"
    assert price.evidence["first_amount"] == Decimal("199")
    assert price.evidence["latest_amount"] == Decimal("349")


def test_insurance_overlap_is_not_inferred_without_coverage_evidence() -> None:
    assert "policy_id" not in FeatureTransaction.__dataclass_fields__
    assert "covered_risk" not in FeatureTransaction.__dataclass_fields__
    policies = []
    for merchant, amount in (("OUTSURANCE", "640"), ("SANTAM", "410")):
        policies.extend(
            _transaction(
                f"{merchant}-{month}",
                amount,
                date(2026, month, 1),
                merchant=merchant,
                category="Insurance",
                description=f"{merchant} INSURANCE",
            )
            for month in (7, 8, 9, 10)
        )
    observations = analyze_behaviour(build_financial_features("user-a", policies)).observations
    assert all(item.evidence.get("finding_focus") != "insurance_overlap" for item in observations)
    leaks = detect_leaks(
        build_financial_features("user-a", policies),
        analyze_behaviour(build_financial_features("user-a", policies)),
    ).leaks
    assert all(item.evidence.get("finding_focus") != "insurance_overlap" for item in leaks)
    assert "duplicate_payment_leak" not in {item.leak_type for item in leaks}

    copied = [
        _transaction(
            "same-a",
            "640",
            date(2026, 7, 1),
            merchant="OUTSURANCE",
            category="Insurance",
            description="OUTSURANCE INSURANCE",
        ),
        _transaction(
            "same-b",
            "640",
            date(2026, 7, 1),
            merchant="OUTSURANCE",
            category="Insurance",
            description="OUTSURANCE INSURANCE",
        ),
        _transaction("later", "80", date(2026, 9, 30), merchant="CHECKERS", category="Groceries"),
    ]
    detected = detect_leaks(
        build_financial_features("user-a", copied),
        analyze_behaviour(build_financial_features("user-a", copied)),
    )
    duplicate = next(item for item in detected.leaks if item.leak_type == "duplicate_payment_leak")
    assert duplicate.evidence["finding_focus"] == "duplicate_merchant_payment"
    assert all(item.evidence.get("finding_focus") != "insurance_overlap" for item in detected.leaks)


def test_insurance_premium_increase_is_distinct_from_other_amount_patterns() -> None:
    premiums = [
        _transaction(
            f"out-{index}",
            amount,
            date(2026, 7 + index, 1),
            merchant="OUTSURANCE",
            category="Insurance",
            description="DEBIT ORDER OUTSURANCE INSURANCE",
        )
        for index, amount in enumerate(("800", "850", "920", "990"))
    ]
    price = next(
        item
        for item in analyze_behaviour(build_financial_features("user-a", premiums)).observations
        if item.behavior_type == "price_increase_pattern"
    )
    assert price.evidence["finding_focus"] == "insurance_premium_increase"
    assert price.evidence["merchant_key"] == "OUTSURANCE"
    assert price.evidence["first_amount"] == Decimal("800")
    assert price.evidence["latest_amount"] == Decimal("990")
    previous_average = (Decimal("800") + Decimal("850") + Decimal("920")) / Decimal("3")
    assert price.evidence["average_previous_amount"] == previous_average
    assert price.evidence["change_amount"] == Decimal("990") - previous_average
    assert price.evidence["insurance_transaction_count"] == 4
    assert price.evidence["observation_count"] == 4
    assert price.evidence["first_observed_date"] == date(2026, 7, 1)
    assert price.evidence["last_observed_date"] == date(2026, 10, 1)
    assert price.description == (
        "Insurance premium payments increased over the analysed period and may warrant review."
    )
    assert price.evidence.get("finding_focus") != "merchant_price_increase"
    assert price.evidence.get("finding_focus") != "debit_order_amount_increase"
    assert price.evidence.get("finding_focus") != "subscription_price_creep"

    described = [
        _transaction(
            f"desc-{index}",
            amount,
            date(2026, 7 + index, 1),
            merchant="MIWAY",
            category="Other",
            description="MIWAY INSURANCE PREMIUM",
        )
        for index, amount in enumerate(("800", "850", "920", "990"))
    ]
    described_price = next(
        item
        for item in analyze_behaviour(build_financial_features("user-a", described)).observations
        if item.behavior_type == "price_increase_pattern"
    )
    assert described_price.evidence["finding_focus"] == "insurance_premium_increase"

    assert "price_increase_pattern" not in _types(
        [
            _transaction(
                f"short-{index}",
                amount,
                date(2026, 7 + index, 1),
                merchant="OUTSURANCE",
                category="Insurance",
            )
            for index, amount in enumerate(("800", "990"))
        ]
    )

    low_confidence = [
        _transaction(
            f"low-{index}",
            amount,
            date(2026, 7 + index, 1),
            merchant="OUTSURANCE",
            category="Insurance",
            confidence=0.35,
        )
        for index, amount in enumerate(("800", "850", "920", "990"))
    ]
    assert all(
        item.evidence.get("finding_focus") != "insurance_premium_increase"
        for item in analyze_behaviour(build_financial_features("user-a", low_confidence)).observations
    )

    copies = [
        _transaction("copy-a", "400", date(2026, 7, 1), merchant="OUTSURANCE", category="Insurance"),
        _transaction("copy-b", "400", date(2026, 7, 1), merchant="OUTSURANCE", category="Insurance"),
        _transaction("copy-c", "500", date(2026, 8, 1), merchant="OUTSURANCE", category="Insurance"),
    ]
    assert "price_increase_pattern" not in _types(copies)


def test_non_subscription_merchant_price_increase_has_no_subscription_focus() -> None:
    transactions = [
        _transaction(f"steers-{index}", amount, date(2026, 7 + index, 12), merchant="STEERS", category="Restaurants")
        for index, amount in enumerate(("120", "160", "220"))
    ]
    price = next(
        item
        for item in analyze_behaviour(build_financial_features("user-a", transactions)).observations
        if item.behavior_type == "price_increase_pattern"
    )
    assert price.evidence["finding_focus"] == "merchant_price_increase"
    assert price.evidence["merchant_key"] == "STEERS"
    assert price.evidence["first_amount"] == Decimal("120")
    assert price.evidence["latest_amount"] == Decimal("220")
    assert "official" not in price.description.lower()
    assert "overcharg" not in price.description.lower()


def test_merchant_price_increase_rejects_noise_duplicates_and_owned_patterns() -> None:
    assert "price_increase_pattern" not in _types(
        [_transaction("once", "220", date(2026, 9, 12), merchant="STEERS", category="Restaurants")]
    )

    copies = [
        _transaction("copy-a", "100", date(2026, 7, 1), merchant="STEERS", category="Restaurants"),
        _transaction("copy-b", "100", date(2026, 7, 1), merchant="STEERS", category="Restaurants"),
        _transaction("later", "200", date(2026, 9, 30), merchant="STEERS", category="Restaurants"),
    ]
    assert "price_increase_pattern" not in _types(copies)

    noisy = [
        _transaction(f"noise-{index}", amount, date(2026, 7 + index, 12), merchant="STEERS", category="Restaurants")
        for index, amount in enumerate(("100", "110", "120"))
    ]
    assert "price_increase_pattern" not in _types(noisy)

    separate = [
        _transaction("shop-a", "100", date(2026, 7, 2), merchant="CHECKERS", category="Groceries"),
        _transaction("shop-b", "180", date(2026, 8, 2), merchant="WOOLWORTHS", category="Groceries"),
        _transaction("shop-c", "260", date(2026, 9, 30), merchant="SPAR", category="Groceries"),
    ]
    assert all(
        item.evidence.get("finding_focus") != "merchant_price_increase"
        for item in analyze_behaviour(build_financial_features("user-a", separate)).observations
    )

    low_confidence = [
        _transaction(
            f"low-{index}",
            amount,
            date(2026, 7 + index, 12),
            merchant="STEERS",
            category="Restaurants",
            confidence=0.35,
        )
        for index, amount in enumerate(("120", "160", "220"))
    ]
    assert "price_increase_pattern" not in _types(low_confidence)


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


def test_weekend_spending_spike_preserves_existing_share_rules() -> None:
    concentrated = [
        _transaction(f"weekend-{index}", "100", date(2026, 8, 1) + timedelta(days=index * 7))
        for index in range(10)
    ]
    observation = next(
        item
        for item in analyze_behaviour(build_financial_features("user-a", concentrated)).observations
        if item.behavior_type == "weekend_spending_pattern"
    )
    assert observation.evidence["finding_focus"] == "weekend_spending_spike"
    assert "impulse" not in observation.description.lower()
    assert "overspend" not in observation.description.lower()

    below_share = [
        _transaction(f"mix-{index}", "100", when)
        for index, when in enumerate(
            (
                date(2026, 8, 1),
                date(2026, 8, 2),
                date(2026, 8, 8),
                date(2026, 8, 3),
                date(2026, 8, 4),
                date(2026, 8, 5),
                date(2026, 8, 6),
                date(2026, 8, 7),
                date(2026, 8, 10),
                date(2026, 8, 11),
            )
        )
    ]
    assert "weekend_spending_pattern" not in _types(below_share)

    too_few = [
        _transaction(f"few-{index}", "100", date(2026, 8, 1) + timedelta(days=index * 7))
        for index in range(9)
    ]
    assert "weekend_spending_pattern" not in _types(too_few)

    undated = [
        FeatureTransaction(
            transaction_id=f"undated-{index}",
            user_id="user-a",
            amount=Decimal("100"),
            transaction_date=None,
            merchant_name="SHOP",
            description="SHOP",
            transaction_type="debit",
            categorisation=CategorisationResult(
                category_name="Shopping",
                category_confidence=0.95,
                transaction_class="spending",
                classification_confidence=0.95,
                merchant_name="SHOP",
            ),
        )
        for index in range(12)
    ]
    assert "weekend_spending_pattern" not in _types(undated)

    incomplete = [
        _transaction(f"jun-{index}", "100", date(2026, 6, 1 + index))
        for index in range(5)
    ]
    incomplete.extend(
        _transaction(f"jul-{index}", "100", date(2026, 7, 1 + index))
        for index in range(5)
    )
    incomplete.extend(
        _transaction(f"aug-{index}", "100", date(2026, 8, 3 + index))
        for index in range(5)
    )
    incomplete.extend(
        [
            _transaction("sep-sat", "2000", date(2026, 9, 5)),
            _transaction("sep-sun", "2000", date(2026, 9, 6)),
        ]
    )
    incomplete_types = _types(incomplete)
    assert "spending_increase" not in incomplete_types
    assert "weekend_spending_pattern" in incomplete_types
    assert "impulse_spending_pattern" not in _focuses(incomplete)

    duplicated = [
        _transaction(f"day-{when.isoformat()}", "50", when)
        for when in (
            date(2026, 8, 3),
            date(2026, 8, 4),
            date(2026, 8, 5),
            date(2026, 8, 6),
            date(2026, 8, 7),
            date(2026, 8, 10),
        )
    ]
    for when in (date(2026, 8, 1), date(2026, 8, 2), date(2026, 8, 8)):
        duplicated.append(_transaction(f"end-{when.isoformat()}", "50", when))
        duplicated.append(_transaction(f"end-copy-{when.isoformat()}", "50", when))
    assert "weekend_spending_pattern" not in _types(duplicated)

    payday = []
    for index, income_day in enumerate((date(2026, 8, 25), date(2026, 9, 25), date(2026, 10, 25))):
        payday.append(
            _transaction(
                f"pay-{index}",
                "5000",
                income_day,
                merchant=None,
                category="Salary",
                transaction_class="income",
                transaction_type="credit",
            )
        )
        for payment in range(4):
            payday.append(
                _transaction(
                    f"after-{index}-{payment}",
                    "100",
                    income_day + timedelta(days=payment % 3),
                    merchant=f"SHOP-{payment}",
                )
            )
    payday_focuses = _focuses(payday)
    assert "payday_spending_pattern" in _types(payday)
    assert "weekend_spending_spike" not in payday_focuses

    coffees = [
        _transaction(
            f"coffee-{index}",
            "45",
            when,
            merchant="SEATTLE COFFEE",
            category="Restaurants",
            description="POS PURCHASE SEATTLE COFFEE",
        )
        for index, when in enumerate(
            (date(2026, 7, 1), date(2026, 7, 6), date(2026, 7, 8), date(2026, 7, 10))
        )
    ]
    assert "coffee_spending_habit" in _focuses(coffees)
    assert "weekend_spending_spike" not in _focuses(coffees)

    stores = [
        _transaction(
            f"spar-{index}",
            "60",
            when,
            merchant="SPAR EXPRESS",
            category="Groceries",
            description="POS PURCHASE SPAR EXPRESS SANDTON",
        )
        for index, when in enumerate(
            (date(2026, 7, 1), date(2026, 7, 2), date(2026, 7, 3), date(2026, 7, 6))
        )
    ]
    assert "convenience_store_spending" in _focuses(stores)
    assert "weekend_spending_spike" not in _focuses(stores)

    fast_food = [
        _transaction(
            f"kfc-{index}",
            "80",
            when,
            merchant="KFC",
            category="Fast Food",
        )
        for index, when in enumerate(
            (date(2026, 7, 1), date(2026, 7, 2), date(2026, 7, 3), date(2026, 7, 6))
        )
    ]
    assert "weekend_spending_spike" not in _focuses(fast_food)
    assert "coffee_spending_habit" not in _focuses(fast_food)
    assert "convenience_store_spending" not in _focuses(fast_food)


def _income(transaction_id: str, when: date, *, transaction_class: str = "income") -> FeatureTransaction:
    return _transaction(
        transaction_id,
        "15000",
        when,
        merchant="ACME PAYROLL",
        category="Salary",
        description="SALARY ACME PAYROLL",
        transaction_class=transaction_class,
        transaction_type="credit",
    )


def test_payday_spending_pattern_preserves_existing_rules() -> None:
    incomes = [_income(f"income-{month}", date(2026, month, 25)) for month in (7, 8, 9)]
    concentrated = [
        *incomes,
        *[
            _transaction(f"near-{month}-{day}", "100", date(2026, month, 25 + day))
            for month in (7, 8, 9)
            for day in range(4)
        ],
    ]
    observation = next(
        item
        for item in analyze_behaviour(build_financial_features("user-a", concentrated)).observations
        if item.behavior_type == "payday_spending_pattern"
    )
    assert observation.evidence["finding_focus"] == "payday_spending_pattern"
    assert "overspend" not in observation.description.lower()
    assert "impulse" not in observation.description.lower()

    assert "payday_spending_pattern" not in _types(concentrated[:2] + concentrated[3:])

    irregular_inflows = [
        _income("transfer-7", date(2026, 7, 25), transaction_class="internal_transfer"),
        _income("transfer-8", date(2026, 8, 25), transaction_class="internal_transfer"),
        _income("transfer-9", date(2026, 9, 25), transaction_class="internal_transfer"),
        *[
            _transaction(f"after-transfer-{month}-{day}", "100", date(2026, month, 25 + day))
            for month in (7, 8, 9)
            for day in range(4)
        ],
    ]
    assert "payday_spending_pattern" not in _types(irregular_inflows)

    irregular_income = [
        _income("gap-1", date(2026, 7, 1)),
        _income("gap-2", date(2026, 7, 20)),
        _income("gap-3", date(2026, 9, 25)),
        *[
            _transaction(f"after-gap-{index}", "100", date(2026, 7, 1) + timedelta(days=index))
            for index in range(12)
        ],
    ]
    assert "payday_spending_pattern" not in _types(irregular_income)

    outside = [
        _transaction(f"outside-{index}", "200", when)
        for index, when in enumerate(
            (
                date(2026, 8, 10),
                date(2026, 8, 12),
                date(2026, 8, 14),
                date(2026, 8, 17),
                date(2026, 8, 19),
                date(2026, 9, 8),
                date(2026, 9, 10),
                date(2026, 9, 12),
                date(2026, 9, 15),
            )
        )
    ]
    below_share = [
        *incomes,
        *outside,
        *[
            _transaction(f"small-{month}", "20", date(2026, month, 25))
            for month in (7, 8, 9)
        ],
    ]
    assert "payday_spending_pattern" not in _types(below_share)

    too_few_spends = [
        *incomes,
        *[
            _transaction(f"few-{month}-{day}", "100", date(2026, month, 25 + day))
            for month in (7, 8, 9)
            for day in range(3)
        ],
    ]
    assert "payday_spending_pattern" not in _types(too_few_spends)

    duplicated = [
        *incomes,
        *[
            _transaction(f"outside-dup-{index}", "100", when)
            for index, when in enumerate(
                (
                    date(2026, 8, 10),
                    date(2026, 8, 15),
                    date(2026, 8, 20),
                    date(2026, 9, 8),
                    date(2026, 9, 12),
                    date(2026, 9, 18),
                )
            )
        ],
    ]
    for month in (7, 8, 9):
        duplicated.append(_transaction(f"window-{month}", "100", date(2026, month, 25)))
        duplicated.append(_transaction(f"window-copy-{month}", "100", date(2026, month, 25)))
    assert "payday_spending_pattern" not in _types(duplicated)

    weekend_only = [
        _transaction(f"weekend-{index}", "100", date(2026, 8, 1) + timedelta(days=index * 7))
        for index in range(10)
    ]
    assert "weekend_spending_spike" in _focuses(weekend_only)
    assert "payday_spending_pattern" not in _focuses(weekend_only)

    subscription = [
        _transaction(f"netflix-{index}", "99", when, merchant="NETFLIX", category="Subscriptions")
        for index, when in enumerate((date(2026, 7, 3), date(2026, 8, 3), date(2026, 9, 3)))
    ]
    subscription.extend(incomes)
    subscription_types = _types(subscription)
    assert "recurring_payment_pattern" in subscription_types
    assert "payday_spending_pattern" not in subscription_types

    transfers = [
        *incomes,
        *[
            _transaction(
                f"move-{month}-{day}",
                "500",
                date(2026, month, 25 + day),
                transaction_class="internal_transfer",
            )
            for month in (7, 8, 9)
            for day in range(4)
        ],
    ]
    assert "payday_spending_pattern" not in _types(transfers)


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
