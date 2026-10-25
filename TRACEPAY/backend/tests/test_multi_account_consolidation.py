"""Cross-bank consolidation: transfers, reversals, totals, ordering, FI integration."""

from __future__ import annotations

import random
from datetime import date
from decimal import Decimal

from leak_intelligence.consolidation import (
    CONFIRM_THRESHOLD,
    AccountIdentity,
    consolidate,
    consolidated_totals,
    order_chronologically,
    reconcile_transfers,
)
from tests.multi_account_helpers import (
    CAPITEC,
    IDENTITIES,
    STANDARD,
    TYME,
    row,
    transactions,
)


def _view(rows):
    return consolidate(transactions(rows), IDENTITIES)


def _by_desc(view, text):
    return next(item for item in view.transactions if text in item.description)


# ---------------------------------------------------------------- internal transfers


def test_transfer_between_own_accounts_is_confirmed_and_excluded_from_totals() -> None:
    rows = [
        row("2026-03-01", "SALARY ACME PTY LTD", "30000", account=CAPITEC),
        row("2026-03-05", "IB PAYMENT TO STANDARD BANK 2222", "-5000", account=CAPITEC),
        row("2026-03-05", "IB TRANSFER FROM CAPITEC 1111", "5000", account=STANDARD),
        row("2026-03-06", "CHECKERS SANDTON", "-800", account=STANDARD, merchant="CHECKERS", category="Groceries"),
    ]
    view = _view(rows)
    assert len(view.reconciliation.links) == 1
    link = view.reconciliation.links[0]
    assert link.confidence >= float(CONFIRM_THRESHOLD)
    assert "debit_names_other_account" in link.evidence["rules"]

    out, into = _by_desc(view, "IB PAYMENT TO"), _by_desc(view, "IB TRANSFER FROM")
    assert out.transfer_status == into.transfer_status == "confirmed"
    assert out.transfer_pair_id == into.transfer_pair_id
    assert out.categorisation.transaction_class == "internal_transfer"

    totals = view.totals["ZAR"]
    assert totals.income == Decimal("30000")
    assert totals.spending == Decimal("800")
    assert totals.confirmed_transfer_volume == Decimal("5000")
    assert totals.by_account[CAPITEC].transfers_out == Decimal("5000")
    assert totals.by_account[STANDARD].transfers_in == Decimal("5000")


def test_transfer_fee_is_linked_but_stays_a_spending_leak() -> None:
    rows = [
        row("2026-03-05", "IB PAYMENT TO STANDARD BANK 2222", "-5000", account=CAPITEC),
        row("2026-03-05", "IMMEDIATE PAYMENT FEE", "-9.50", account=CAPITEC, klass="bank_fee", category="Bank Fees"),
        row("2026-03-05", "IB TRANSFER FROM CAPITEC 1111", "5000", account=STANDARD),
        row("2026-03-20", "MONTHLY ACCOUNT FEE", "-69", account=CAPITEC, klass="bank_fee", category="Bank Fees"),
    ]
    view = _view(rows)
    link = view.reconciliation.links[0]
    fee = _by_desc(view, "IMMEDIATE PAYMENT FEE")
    assert link.fee_ids == (fee.transaction_id,)
    assert fee.transfer_fee_for == link.debit_id
    # The unrelated monthly fee is not attached to the transfer.
    assert _by_desc(view, "MONTHLY ACCOUNT FEE").transfer_fee_for is None

    totals = view.totals["ZAR"]
    assert totals.confirmed_transfer_volume == Decimal("5000")
    assert totals.spending == Decimal("78.50"), "both fees still count as spending"
    assert totals.bank_fees == Decimal("78.50")


def test_equal_amounts_alone_do_not_make_a_transfer() -> None:
    rows = [
        row("2026-03-05", "RENT PAYMENT LANDLORD", "-5000", account=CAPITEC),
        row("2026-03-05", "CLIENT INVOICE 0042", "5000", account=STANDARD, klass="income"),
    ]
    view = _view(rows)
    assert view.reconciliation.links == []
    assert len(view.reconciliation.candidates) == 1
    assert view.reconciliation.candidates[0].evidence["reason"] == "insufficient_evidence"
    rent = _by_desc(view, "RENT")
    assert rent.transfer_status == "candidate"
    assert rent.categorisation.transaction_class == "spending"
    totals = view.totals["ZAR"]
    assert totals.income == Decimal("5000") and totals.spending == Decimal("5000")
    assert totals.confirmed_transfer_volume == 0
    assert totals.unconfirmed_transfer_volume == Decimal("5000")


def test_salary_shaped_credit_is_never_a_transfer_even_with_a_transfer_word() -> None:
    rows = [
        row("2026-03-25", "TRANSFER TO SAVINGS", "-3000", account=CAPITEC),
        row("2026-03-25", "SALARY ACME TRANSFER", "3000", account=STANDARD, klass="income"),
    ]
    assert _view(rows).reconciliation.links == []


def test_ambiguous_partners_are_kept_as_candidates_not_confirmed() -> None:
    rows = [
        row("2026-03-05", "IB PAYMENT TO MY ACCOUNT", "-2000", account=CAPITEC),
        row("2026-03-05", "TRANSFER RECEIVED", "2000", account=STANDARD, klass="income"),
        row("2026-03-05", "TRANSFER RECEIVED", "2000", account=TYME, klass="income"),
    ]
    view = _view(rows)
    assert view.reconciliation.links == []
    assert view.reconciliation.candidates
    assert view.reconciliation.candidates[0].evidence["reason"] == "ambiguous_between_several_matches"


def test_pairs_outside_the_hard_requirements_are_never_proposed() -> None:
    same_account = _view(
        [
            row("2026-03-05", "TRANSFER OUT", "-100", account=CAPITEC),
            row("2026-03-05", "TRANSFER IN", "100", account=CAPITEC, klass="income"),
        ]
    )
    too_late = _view(
        [
            row("2026-03-01", "IB PAYMENT TO STANDARD BANK 2222", "-100", account=CAPITEC),
            row("2026-03-06", "IB TRANSFER FROM CAPITEC 1111", "100", account=STANDARD, klass="income"),
        ]
    )
    other_currency = _view(
        [
            row("2026-03-05", "IB PAYMENT TO STANDARD BANK 2222", "-100", account=CAPITEC),
            row("2026-03-05", "IB TRANSFER FROM CAPITEC 1111", "100", account=STANDARD, klass="income", currency="USD"),
        ]
    )
    different_cents = _view(
        [
            row("2026-03-05", "IB PAYMENT TO STANDARD BANK 2222", "-100.00", account=CAPITEC),
            row("2026-03-05", "IB TRANSFER FROM CAPITEC 1111", "100.01", account=STANDARD, klass="income"),
        ]
    )
    for view in (same_account, too_late, other_currency, different_cents):
        assert view.reconciliation.links == []
        assert view.reconciliation.candidates == []


def test_overlap_duplicates_are_never_paired() -> None:
    rows = [
        row("2026-03-05", "IB PAYMENT TO STANDARD BANK 2222", "-5000", account=CAPITEC),
        row("2026-03-05", "IB TRANSFER FROM CAPITEC 1111", "5000", account=STANDARD, klass="income", is_duplicate=True),
    ]
    assert _view(rows).reconciliation.links == []


def test_credit_arriving_a_few_days_later_still_pairs_with_strong_evidence() -> None:
    rows = [
        row("2026-03-06", "IB PAYMENT TO STANDARD BANK 2222 REF HOUSEFUND", "-1500", account=CAPITEC),
        row("2026-03-09", "IB TRANSFER FROM CAPITEC 1111 REF HOUSEFUND", "1500", account=STANDARD, klass="income"),
    ]
    link = _view(rows).reconciliation.links[0]
    assert link.evidence["days_apart"] == 3
    assert "shared_reference" in link.evidence["rules"]


def test_repeated_monthly_transfers_pair_one_to_one() -> None:
    rows = []
    for month in ("2026-01", "2026-02", "2026-03"):
        rows.append(row(f"{month}-25", "IB PAYMENT TO TYME 3333 SAVINGS", "-1000", account=CAPITEC))
        rows.append(row(f"{month}-25", "TRANSFER FROM CAPITEC 1111", "1000", account=TYME, klass="income"))
    view = _view(rows)
    assert len(view.reconciliation.links) == 3
    assert view.totals["ZAR"].confirmed_transfer_volume == Decimal("3000")
    assert view.totals["ZAR"].income == 0


def test_transfer_reconciliation_is_idempotent() -> None:
    rows = [
        row("2026-03-05", "IB PAYMENT TO STANDARD BANK 2222", "-5000", account=CAPITEC),
        row("2026-03-05", "IB TRANSFER FROM CAPITEC 1111", "5000", account=STANDARD, klass="income"),
    ]
    first = _view(rows)
    second = consolidate(first.transactions, IDENTITIES)
    assert second.reconciliation.links == []
    assert second.reconciliation.unlink == []
    assert second.totals["ZAR"].confirmed_transfer_volume == Decimal("5000")


def test_legacy_amount_only_pair_is_withdrawn_unless_the_text_supports_a_transfer() -> None:
    rows = [
        row(
            "2026-03-05", "RENT PAYMENT", "-5000", account=CAPITEC,
            klass="internal_transfer", transfer_status="candidate", transfer_pair_id="legacy-1",
        ),
        row(
            "2026-03-07", "ONLINE SALE 77", "5000", account=STANDARD,
            klass="internal_transfer", transfer_status="candidate", transfer_pair_id="legacy-1",
        ),
    ]
    view = _view(rows)
    assert len(view.reconciliation.unlink) >= 1
    rent = _by_desc(view, "RENT")
    assert rent.transfer_status != "confirmed"
    assert rent.categorisation.transaction_class == "unknown"


def test_database_payload_matches_the_apply_function_contract() -> None:
    rows = [
        row("2026-03-05", "IB PAYMENT TO STANDARD BANK 2222", "-5000", account=CAPITEC),
        row("2026-03-05", "IMMEDIATE PAYMENT FEE", "-9.5", account=CAPITEC, klass="bank_fee"),
        row("2026-03-05", "IB TRANSFER FROM CAPITEC 1111", "5000", account=STANDARD, klass="income"),
    ]
    payload = reconcile_transfers(transactions(rows), IDENTITIES).as_rpc_payload()
    assert set(payload) == {"p_links", "p_candidates", "p_unlink", "p_reversals"}
    link = payload["p_links"][0]
    assert set(link) == {"debit_id", "credit_id", "confidence", "evidence", "fee_ids"}
    assert len(link["fee_ids"]) == 1


# ------------------------------------------------------------- reversals and refunds


def test_refund_is_linked_to_its_purchase_and_is_not_income() -> None:
    rows = [
        row("2026-02-01", "SALARY ACME", "20000"),
        row("2026-02-02", "TAKEALOT ORDER 123", "-1500", merchant="TAKEALOT", category="Shopping"),
        row("2026-02-09", "TAKEALOT REFUND 123", "1500", merchant="TAKEALOT", klass="unknown"),
    ]
    view = _view(rows)
    assert view.reconciliation.reversals == [
        (_by_desc(view, "REFUND").transaction_id, _by_desc(view, "ORDER").transaction_id)
    ]
    totals = view.totals["ZAR"]
    assert totals.income == Decimal("20000")
    assert totals.refunds == Decimal("1500")
    assert totals.net_spending == Decimal("0")


def test_refund_dated_before_the_purchase_is_not_linked() -> None:
    rows = [
        row("2026-02-01", "TAKEALOT REFUND 123", "1500", merchant="TAKEALOT", klass="unknown"),
        row("2026-02-05", "TAKEALOT ORDER 123", "-1500", merchant="TAKEALOT", category="Shopping"),
    ]
    assert _view(rows).reconciliation.reversals == []


def test_refund_for_a_different_merchant_or_larger_amount_is_not_linked() -> None:
    rows = [
        row("2026-02-02", "TAKEALOT ORDER 123", "-500", merchant="TAKEALOT", category="Shopping"),
        row("2026-02-09", "WOOLWORTHS REFUND", "500", merchant="WOOLWORTHS", klass="unknown"),
        row("2026-02-10", "TAKEALOT REFUND", "900", merchant="TAKEALOT", klass="unknown"),
    ]
    assert _view(rows).reconciliation.reversals == []


# --------------------------------------------------------------------------- totals


def test_consolidated_totals_across_three_banks_are_exact() -> None:
    rows = [
        # Capitec: salary and daily spending
        row("2026-04-01", "SALARY ACME", "28000", account=CAPITEC),
        row("2026-04-03", "CHECKERS", "-640.40", account=CAPITEC, merchant="CHECKERS", category="Groceries"),
        row("2026-04-04", "UBER TRIP", "-95", account=CAPITEC, merchant="UBER", category="Ride Hailing"),
        row("2026-04-05", "IB PAYMENT TO STANDARD BANK 2222", "-6000", account=CAPITEC),
        row("2026-04-05", "IB PAYMENT TO TYME 3333", "-2000", account=CAPITEC),
        # Standard Bank: debit orders
        row("2026-04-05", "IB TRANSFER FROM CAPITEC 1111", "6000", account=STANDARD),
        row("2026-04-06", "DEBIT ORDER VODACOM", "-499", account=STANDARD, merchant="VODACOM", category="Telecoms"),
        row("2026-04-07", "DEBIT ORDER DISCOVERY", "-1800", account=STANDARD, merchant="DISCOVERY", category="Insurance"),
        row("2026-04-30", "INTEREST EARNED", "12.10", account=STANDARD),
        # TymeBank: savings
        row("2026-04-05", "TRANSFER FROM CAPITEC 1111", "2000", account=TYME),
        row("2026-04-28", "TAKEALOT REFUND", "300", account=TYME, merchant="TAKEALOT", klass="unknown"),
        # An overlapping-statement copy must not count.
        row("2026-04-03", "CHECKERS", "-640.40", account=CAPITEC, merchant="CHECKERS", category="Groceries", is_duplicate=True),
    ]
    view = _view(rows)
    totals = view.totals["ZAR"]
    assert totals.income == Decimal("28012.10")
    assert totals.spending == Decimal("640.40") + 95 + 499 + 1800
    assert totals.refunds == Decimal("300")
    assert totals.confirmed_transfer_volume == Decimal("8000")
    assert totals.excluded_duplicate_count == 1
    assert totals.transaction_count == 11
    assert totals.by_account[CAPITEC].spending == Decimal("735.40")
    assert totals.by_account[STANDARD].income == Decimal("12.10")
    # Money in, spending and transfers reconcile to the net movement of all accounts.
    net_movement = sum(
        (
            item.amount
            for item in view.transactions
            if not item.is_duplicate
        ),
        Decimal("0"),
    )
    assert net_movement == (
        totals.income + totals.refunds - totals.spending
        + sum(a.transfers_in - a.transfers_out for a in totals.by_account.values())
    )


def test_different_currencies_are_never_summed_together() -> None:
    rows = [
        row("2026-04-03", "AMAZON", "-100", merchant="AMAZON", currency="USD"),
        row("2026-04-04", "CHECKERS", "-100", merchant="CHECKERS", currency="ZAR"),
    ]
    totals = consolidated_totals(transactions(rows))
    assert totals["USD"].spending == 100 and totals["ZAR"].spending == 100


def test_possible_duplicates_stay_in_totals_but_are_counted() -> None:
    rows = [row("2026-04-03", "CHECKERS", "-100", dedupe_status="possible_duplicate")]
    totals = consolidated_totals(transactions(rows))["ZAR"]
    assert totals.spending == 100 and totals.possible_duplicate_count == 1


# ---------------------------------------------------------------------------- order


def test_year_end_sequence_sorts_by_actual_date_whatever_the_extraction_order() -> None:
    rows = [
        row("2026-01-02", "SALARY ACME", "20000"),
        row("2025-12-31", "CHECKERS", "-100", merchant="CHECKERS"),
        row("2025-12-30", "WOOLWORTHS", "-80", merchant="WOOLWORTHS"),
        row("2026-01-01", "NETFLIX", "-199", merchant="NETFLIX"),
    ]
    shuffled = transactions(rows)
    random.Random(7).shuffle(shuffled)
    assert [item.transaction_date.isoformat() for item in order_chronologically(shuffled)] == [
        "2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02",
    ]


def test_same_day_order_is_deterministic_and_input_independent() -> None:
    rows = [row("2026-03-01", f"PAYMENT {index}", f"-{10 + index}", row_id=f"id-{index}", source_row=index) for index in range(6)]
    first = [item.transaction_id for item in order_chronologically(transactions(rows))]
    for seed in range(5):
        items = transactions(rows)
        random.Random(seed).shuffle(items)
        assert [item.transaction_id for item in order_chronologically(items)] == first


def test_timestamps_are_used_only_when_the_statement_gave_them() -> None:
    rows = [
        row("2026-03-01", "LATER", "-1", transaction_time="14:30:00", row_id="b"),
        row("2026-03-01", "EARLIER", "-1", transaction_time="09:05:00", row_id="a"),
        row("2026-03-01", "NO TIME", "-1", row_id="c"),
    ]
    ordered = order_chronologically(transactions(rows))
    assert [item.transaction_id for item in ordered] == ["a", "b", "c"]
    assert ordered[2].transaction_time is None


def test_transactions_without_a_date_sort_last_and_are_not_given_one() -> None:
    items = transactions([row("2026-03-01", "DATED", "-1")])
    undated = items[0].__class__(**{**items[0].__dict__, "transaction_id": "u", "transaction_date": None})
    ordered = order_chronologically([undated, *items])
    assert ordered[-1].transaction_date is None


def test_date_confidence_and_provenance_survive_the_adapter() -> None:
    item = transactions(
        [
            row(
                "2026-03-01", "CARD PURCHASE", "-50", date_confidence="medium", value_date="2026-03-03",
                booking_date="2026-03-02", reference="REF123456", source_row=7, bank_key="capitec",
            )
        ]
    )[0]
    assert item.date_confidence == "medium"
    assert item.value_date == date(2026, 3, 3)
    assert item.booking_date == date(2026, 3, 2)
    assert item.reference == "REF123456" and item.source_row == 7 and item.bank_key == "capitec"
    assert item.account_last4 == "1111"


def test_account_identity_never_carries_a_full_number() -> None:
    identity = AccountIdentity("a", "capitec", "1111")
    assert set(identity.__dict__) == {"account_id", "bank_key", "last4"}
