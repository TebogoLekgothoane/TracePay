import pytest

from categorisation.classifier import classify_transaction


@pytest.mark.parametrize(("description", "category"), [
    ("WOOLWORTHS", "Groceries"), ("CHECKERS", "Groceries"), ("SHOPRITE", "Groceries"),
    ("NANDO'S", "Restaurants"), ("MUGG & BEAN", "Restaurants"),
    ("KFC", "Fast Food"), ("MCDONALDS", "Fast Food"),
    ("UBER", "Ride Hailing"), ("BOLT", "Ride Hailing"), ("SHELL", "Fuel"), ("GAUTRAIN", "Public Transport"),
    ("MTN AIRTIME", "Airtime & Data"), ("VODACOM DATA", "Airtime & Data"),
    ("NETFLIX", "Subscriptions"), ("SPOTIFY", "Subscriptions"), ("DSTV", "Subscriptions"),
    ("FNB SERVICE FEE", "Bank Fees"),
    ("SALARY", "Salary"), ("PAYROLL", "Salary"), ("ELECTRICITY", "Utilities"),
])
def test_known_rules(description: str, category: str) -> None:
    result = classify_transaction(description, "credit" if category == "Salary" else "debit")
    assert result.category_name == category
    assert result.confidence > 0
    assert result.rule


def test_case_and_merchant_variations() -> None:
    assert classify_transaction("woolworths").category_name == "Groceries"
    assert classify_transaction("Woolworths Store 123").category_name == "Groceries"
    assert classify_transaction("WOOLWORTHS CAPE TOWN").category_name == "Groceries"


def test_unknown_and_amount_independence() -> None:
    assert classify_transaction("RANDOM UNKNOWN MERCHANT").category_name is None
    assert classify_transaction("WOOLWORTHS", "debit").category_name == classify_transaction("WOOLWORTHS", "credit").category_name


def test_data_alone_is_not_airtime() -> None:
    assert classify_transaction("CUSTOMER DATA REPORT").category_name is None


def test_salary_advance_is_other_income() -> None:
    assert classify_transaction("SALARY ADVANCE", "credit").category_name == "Other Income"
    assert classify_transaction("SALARY ADVANCE", "debit").category_name is None


@pytest.mark.parametrize(("description", "transaction_class"), [
    ("Pay Beneficiary, Mosto", "person_to_person"),
    ("Money transferred out from GoalSave", "internal_transfer"),
    ("Money added to Fixed Deposit 30710268044", "savings"),
])
def test_non_spending_transaction_classes(description: str, transaction_class: str) -> None:
    result = classify_transaction(description, "debit")
    assert result.transaction_class == transaction_class
    assert result.category_name is None


def test_eft_and_generic_purchase_are_not_deterministic_categories() -> None:
    eft = classify_transaction("EFT for CAPITEC J MAPHOSA", "debit")
    purchase = classify_transaction("Purchase at BUCCANEERS", "debit")
    assert eft.transaction_class == "unknown"
    assert purchase.transaction_class == "unknown"


def test_payshap_is_left_for_ai_context() -> None:
    result = classify_transaction("PayShap - Pay by ShapID, grocery", "debit")
    assert result.transaction_class == "unknown"
    assert result.category_name is None


def test_data_bundle_is_airtime_and_data() -> None:
    result = classify_transaction("VAS - Mobile Purchase for 0716423985 Data Bundle", "debit")
    assert result.transaction_class == "spending"
    assert result.category_name == "Airtime & Data"


@pytest.mark.parametrize(("description", "category"), [
    ("Purchase at TROPICAL FRUIT", "Groceries"),
    ("Purchase at S2SAubsSpaza", "Groceries"),
])
def test_common_statement_descriptions(description: str, category: str) -> None:
    assert classify_transaction(description, "debit").category_name == category
