"""Descriptions copied from real GoTyme statement shapes (personal data removed)."""

from datetime import date
from decimal import Decimal

import pytest

from categorisation.classifier import classify_transaction
from leak_intelligence.behaviour_engine import analyze_behaviour
from leak_intelligence.engine import build_financial_features
from leak_intelligence.leak_engine import detect_leaks
from leak_intelligence.models import FeatureTransaction

CURSOR_FAIL = (
    "Fee: Unsuccessful Int Recurring Payment from CURSOR, AI POWERED IDE +18314259504 US "
    "for ZAR351.15. Amount R351.15 Ref {ref} - insufficient funds (ref:7037)"
)
BOLT_FAIL = "Fee: Unsuccessful Recurring Payment from DL Bolt CPT ZA {ref} - insufficient funds"
VAS_FEE = "Fee - VAS purchase for Mobile from MTN, for +27•••••4013"


@pytest.mark.parametrize(
    ("description", "kind", "expected_class", "expected_category"),
    [
        (CURSOR_FAIL.format(ref="613100149343"), "debit", "bank_fee", "Bank Fees"),
        (BOLT_FAIL.format(ref="614309883780"), "debit", "bank_fee", "Bank Fees"),
        ("Fee: Unsuccessful Purchase at MCD Oxford Rd (0404) Sandton ZA 621204661113 - insufficient funds", "debit", "bank_fee", "Bank Fees"),
        ("Fee: VAS - Mobile Purchase for 0634994013 Airtime", "debit", "bank_fee", "Bank Fees"),
        (VAS_FEE, "debit", "bank_fee", "Bank Fees"),
        ("Card replacement fee", "debit", "bank_fee", "Bank Fees"),
        ("Fee: Purchase LOTTO", "debit", "bank_fee", "Bank Fees"),
        ("VAS purchase for Mobile from MTN, for +27•••••4013", "debit", "spending", "Airtime & Data"),
        ("VAS - Mobile Purchase for 0634994013 Airtime", "debit", "spending", "Airtime & Data"),
        ("Purchase, with card at EPOS at DLBolt CPT ZA", "debit", "spending", "Ride Hailing"),
        ("Recurring Payment from DLUBER CPT ZA 626407850529", "debit", "spending", "Ride Hailing"),
        ("Recurring Payment from DLUber Eats CPT ZA 624616307000", "debit", "spending", "Fast Food"),
        ("Online Purchase from MrD Cape Town ZA 622308123742", "debit", "spending", "Fast Food"),
        ("Int Recurring Payment from SpotifyZA Stockholm SE for ZAR69.99", "debit", "spending", "Subscriptions"),
        ("Payment to TE LEKGOTHOANE Capitec, Mobile No. +27•••••4013, T. LEKGOTHOANE", "debit", "person_to_person", "Transfers"),
        ("Money transferred out from GoalSave 50470680472", "credit", "internal_transfer", "Transfers"),
        ("Money added to Fixed Deposit 30306576506", "debit", "savings", "Savings"),
    ],
)
def test_gotyme_description_shapes(description, kind, expected_class, expected_category) -> None:
    result = classify_transaction(description, kind)
    assert (result.transaction_class, result.category_name) == (expected_class, expected_category)


def test_fee_reversal_is_not_a_fee_or_a_purchase() -> None:
    result = classify_transaction("Fee Reversal - VAS - Mobile Purchase Reversal for Airtime 0634994013", "credit")
    assert result.transaction_class == "unknown"


def _tx(identifier: str, when: date, description: str, amount: str, kind: str = "debit") -> FeatureTransaction:
    result = classify_transaction(description, kind)
    return FeatureTransaction(
        transaction_id=identifier,
        user_id="user-a",
        amount=Decimal(amount),
        transaction_date=when,
        merchant_name=result.merchant_name,
        description=description,
        transaction_type=kind,
        categorisation=result,
    )


def test_failed_payment_fees_are_fees_not_spend_and_typed_by_failure() -> None:
    rows: list[FeatureTransaction] = []
    n = 0
    for month in (6, 7, 8):
        for day in (7, 9, 11, 13):
            n += 1
            rows.append(_tx(f"f{n}", date(2026, month, day), CURSOR_FAIL.format(ref=f"6100{n:08d}"), "10"))
        n += 1
        rows.append(_tx(f"b{n}", date(2026, month, 14), BOLT_FAIL.format(ref=f"6200{n:08d}"), "3"))
        n += 1
        rows.append(_tx(f"v{n}", date(2026, month, 15), VAS_FEE, "0.50"))
        n += 1
        rows.append(_tx(f"p{n}", date(2026, month, 15), "VAS purchase for Mobile from MTN, for +27•••••4013", "30"))
    rows.append(_tx("rep", date(2026, 7, 23), "Card replacement fee", "100"))
    rows.append(_tx("sal", date(2026, 9, 1), "PayShap - Pay by Account, Employer", "5000", "credit"))

    snapshot = build_financial_features("user-a", rows)
    fees = snapshot.fees

    assert fees.insufficient_funds_fee_count == 15
    assert fees.insufficient_funds_fee_total == Decimal("129")
    assert fees.vas_fee_total == Decimal("1.50")
    assert fees.vas_fee_count == 3
    assert fees.card_replacement_fee_total == Decimal("100")
    assert fees.bank_fee_total == Decimal("230.50")
    assert snapshot.spending_profile.bank_fee_total == Decimal("230.50")
    # Failed attempts must not inflate subscription or ride spending.
    assert snapshot.spending_profile.spending_by_category.get("Subscriptions") is None
    assert snapshot.spending_profile.spending_by_category.get("Ride Hailing") is None
    assert snapshot.spending_profile.spending_by_category["Airtime & Data"] == Decimal("90")

    leaks = detect_leaks(snapshot, analyze_behaviour(snapshot))
    fee_leak = next(item for item in leaks.leaks if item.leak_type == "bank_fee_leak")
    assert fee_leak.evidence["fee_type_breakdown"]["insufficient_funds_fees"] == Decimal("129")
    assert fee_leak.evidence["fee_type_breakdown"]["vas_fees"] == Decimal("1.50")


def test_monthly_subscriptions_report_their_real_monthly_cost_including_spotifyza() -> None:
    rows: list[FeatureTransaction] = []
    for month in (6, 7, 8, 9):
        rows.append(_tx(f"s{month}", date(2026, month, 28), "Int Recurring Payment from SpotifyZA Stockholm SE for ZAR69.99", "69.99"))
        rows.append(_tx(f"c{month}", date(2026, month, 15), "Int Recurring Payment from OPENAI *CHATGPT SUBSCR +14158799686 US for ZAR149.00", "149.00"))
        rows.append(_tx(f"i{month}", date(2026, month, 1), "PayShap - Pay by Account, Employer", "9000", "credit"))
    snapshot = build_financial_features("user-a", rows)
    leaks = detect_leaks(snapshot, analyze_behaviour(snapshot))
    impacts = {
        item.title.split(" subscription")[0]: item.estimated_monthly_impact
        for item in leaks.leaks
        if item.leak_type == "subscription_leak"
    }
    assert impacts == {"Spotify": Decimal("69.99"), "Chatgpt": Decimal("149.00")}


def _habit_rows(*, bolt_amounts=(30, 30, 30, 30)) -> list[FeatureTransaction]:
    rows: list[FeatureTransaction] = []
    n = 0
    for month in (6, 7, 8, 9):
        for day in (3, 8, 13, 18, 23):
            n += 1
            rows.append(_tx(f"a{n}", date(2026, month, day), "VAS purchase for Mobile from MTN, for +27•••••4013", "25"))
            n += 1
            rows.append(_tx(f"bf{n}", date(2026, month, day), VAS_FEE, "0.50"))
        for index, day in enumerate((2, 12, 22, 27)):
            n += 1
            rows.append(_tx(f"u{n}", date(2026, month, day), f"Recurring Payment from DL Uber Eats CPT ZA 62{n:09d}", "120"))
            n += 1
            rows.append(_tx(f"b{n}", date(2026, month, day), f"Recurring Payment from DL Bolt CPT ZA 61{n:09d}", str(bolt_amounts[index])))
        rows.append(_tx(f"i{month}", date(2026, month, 1), "PayShap - Pay by Account, Employer", "9000", "credit"))
    return rows


def test_flat_airtime_and_food_delivery_habits_are_reported() -> None:
    snapshot = build_financial_features("user-a", _habit_rows())
    leaks = {item.leak_type: item for item in detect_leaks(snapshot, analyze_behaviour(snapshot)).leaks}

    airtime = leaks["airtime_data_leak"]
    assert airtime.estimated_monthly_impact == Decimal("125.00")
    assert airtime.evidence["monthly_average_transactions"] == Decimal("5.0")
    assert airtime.evidence["vas_fee_total"] == Decimal("10.00")
    assert airtime.estimated_annual_impact == Decimal("1500.00")

    food = leaks["food_spending_leak"]
    assert food.estimated_monthly_impact == Decimal("480.00")
    assert food.evidence["finding_focus"] == "sustained_habit"


def test_habit_needs_every_completed_month_and_enough_repeats() -> None:
    rows = [item for item in _habit_rows() if item.transaction_date.month != 7 or "Uber Eats" not in item.description]
    snapshot = build_financial_features("user-a", rows)
    leaks = detect_leaks(snapshot, analyze_behaviour(snapshot)).leaks
    assert all(item.leak_type != "food_spending_leak" for item in leaks)


def _detected(rows):
    from leak_intelligence.leak_evidence import attach_supporting_transactions

    snapshot = build_financial_features("user-a", rows)
    result = detect_leaks(snapshot, analyze_behaviour(snapshot))
    return {item.leak_type: item for item in attach_supporting_transactions(result, rows).leaks}


def test_each_leak_lists_the_rows_that_make_up_its_numbers() -> None:
    rows = _habit_rows()
    for month in (6, 7, 8, 9):
        rows.append(_tx(f"sp{month}", date(2026, month, 28), "Int Recurring Payment from SpotifyZA Stockholm SE for ZAR69.99", "69.99"))
    for month in (6, 7, 8):
        for k in range(2):
            rows.append(_tx(f"ff{month}{k}", date(2026, month, 9 + k), CURSOR_FAIL.format(ref=f"6100{month}{k}0000"), "10"))
    leaks = _detected(rows)

    airtime = leaks["airtime_data_leak"]
    payments = [r for r in airtime.supporting_transactions if r.role == "payment"]
    fees = [r for r in airtime.supporting_transactions if r.role == "fee"]
    assert len(payments) == 15 and sum(r.amount for r in payments) == Decimal("375")
    assert len(fees) == 20 and sum(r.amount for r in fees) == Decimal("10.00")
    assert airtime.supporting_transaction_count == 35
    assert all("4013" not in r.description for r in airtime.supporting_transactions)

    food = leaks["food_spending_leak"]
    assert {r.role for r in food.supporting_transactions} == {"payment"}
    assert sum(r.amount for r in food.supporting_transactions) == food.evidence["category_total_amount"]

    spotify = leaks["subscription_leak"]
    assert [r.amount for r in spotify.supporting_transactions] == [Decimal("69.99")] * 4

    fee_leak = leaks["bank_fee_leak"]
    typed = [r for r in fee_leak.supporting_transactions if r.role == "fee"]
    assert sum(r.amount for r in typed) == fee_leak.evidence["fee_type_breakdown"]["insufficient_funds_fees"]
    assert {r.role for r in fee_leak.supporting_transactions} <= {"fee", "other_fee"}


def test_reversed_rides_are_shown_and_do_not_count_as_spend() -> None:
    rows = _habit_rows(bolt_amounts=(30, 31, 32, 33))
    rows.append(_tx("rv1", date(2026, 9, 2), "Reversal - Online Purchase from DL Bolt CPT ZA 619999999999", "30", "credit"))
    snapshot = build_financial_features("user-a", rows)
    profile = snapshot.spending_profile
    gross = Decimal("30") * 4 + Decimal("31") * 4 + Decimal("32") * 4 + Decimal("33") * 4
    # The category total must not still include the reversed trip's original debit.
    assert profile.spending_by_category["Ride Hailing"] <= gross


CHATGPT_PAYMENT = "Int Recurring Payment from OPENAI *CHATGPT SUBSCR +14158799686 US for ZAR149.00"
CHATGPT_FAIL = (
    "Fee: Unsuccessful Int Recurring Payment from OPENAI *CHATGPT SUBSCR +14158799686 US "
    "for ZAR149.00. Amount R149.00 Ref 625800000001 - insufficient funds"
)


def test_chatgpt_failed_attempt_fee_is_not_a_payment() -> None:
    """15 Jun: a real R149 charge. 15 Sep: R10 fee for a failed R149 attempt."""
    from pdf_processor.normalise import normalize_row
    from pdf_processor.tables import canonical_header
    from pdf_processor.validate import reconcile_balances
    from leak_intelligence.subscription_detection import detect_subscriptions

    headers = [canonical_header(cell) for cell in ("Date", "Details", "Fees(-)", "Credits (+)", "Debits (-)", "Running Balance")]
    table = [
        ["01 Jun 2026", "PayShap - Pay by Account, Employer", "-", "9,000", "-", "9,200.00"],
        ["15 Jun 2026", CHATGPT_PAYMENT, "-", "-", "149", "9,051.00"],
        ["15 Jul 2026", CHATGPT_PAYMENT, "-", "-", "149", "8,902.00"],
        ["15 Aug 2026", CHATGPT_PAYMENT, "-", "-", "149", "8,753.00"],
        ["15 Sep 2026", CHATGPT_FAIL, "10", "-", "-", "8,743.00"],
    ]
    extracted = [normalize_row(row, headers, index) for index, row in enumerate(table, start=1)]
    assert all(item is not None for item in extracted)
    assert reconcile_balances(extracted) == "verified"
    assert [item.amount for item in extracted[1:]] == [Decimal("-149")] * 3 + [Decimal("-10")]

    rows = [
        _tx(f"r{index}", item.date, item.description, str(abs(item.amount)), item.type)
        for index, item in enumerate(extracted)
    ]
    (chatgpt,) = [group for group in detect_subscriptions(rows) if group.canonical_name == "chatgpt"]
    assert chatgpt.successful_payment_count == 3
    assert chatgpt.current_amount == Decimal("149.00")
    assert date(2026, 6, 15) in [o.transaction_date for o in chatgpt.observations if o.outcome == "successful"]
    (failure,) = [o for o in chatgpt.observations if o.outcome == "failed"]
    assert failure.transaction_date == date(2026, 9, 15)
    assert failure.referenced_amount == Decimal("149.00")
    assert failure.fee_amount == Decimal("10")
    assert chatgpt.total_failure_fees == Decimal("10")
