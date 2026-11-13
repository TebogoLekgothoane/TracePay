from datetime import date
from decimal import Decimal

from leak_intelligence.statement_review import context_from_printed_figures
from pdf_processor.statement_figures import extract_printed_figures
from tests.statement_review_helpers import HEADERS, investec_context, investec_figure_rows


def _header(name: str) -> str:
    return (HEADERS / name).read_text(encoding="utf-8")


def test_reads_every_printed_figure_from_a_real_statement_header() -> None:
    figures = extract_printed_figures(_header("2026-06.txt"))
    assert figures is not None
    assert figures.statement_date == date(2026, 6, 30)
    assert figures.debit_interest_rate == Decimal("10.50")
    assert figures.credit_interest_rate == Decimal("0.50")  # printed as ".50%"
    assert figures.facility == Decimal("50000.00")
    assert figures.card_purchases == Decimal("6486.96")
    assert figures.fees_total == Decimal("747.17")
    assert figures.interest_paid == Decimal("414.03")
    assert figures.interest_received is None  # not printed that month


def test_reads_the_money_out_and_money_in_summary_lines() -> None:
    figures = extract_printed_figures(_header("2026-06.txt"))
    assert figures is not None
    assert figures.online_payments == Decimal("52362.40")
    assert figures.deposits_received == Decimal("61031.12")


def test_the_context_totals_money_out_and_in_from_the_summary_lines() -> None:
    context = investec_context()
    # Card purchases + online payments + interest paid + fees; deposits + interest received.
    assert context.statement_debit_totals["2026-06"] == Decimal("60010.56")
    assert context.statement_credit_totals["2026-06"] == Decimal("61031.12")
    assert context.statement_credit_totals["2026-10"] == Decimal("88453.45")  # includes R0.19 interest


def test_a_summary_without_the_two_standing_lines_gives_no_totals() -> None:
    rows = [
        {
            "account_id": "acc-1",
            "printed_figures": {"statement_date": "2026-06-30", "card_purchases": "100.00", "fees_total": "5.00"},
        }
    ]
    context = context_from_printed_figures(rows)
    assert context.statement_debit_totals == {} and context.statement_credit_totals == {}


def test_a_figure_printed_only_some_months_is_read_only_those_months() -> None:
    figures = extract_printed_figures(_header("2026-10.txt"))
    assert figures is not None and figures.interest_received == Decimal("0.19")


def test_the_rate_change_is_read_from_the_statement_that_prints_it() -> None:
    august = extract_printed_figures(_header("2026-08.txt"))
    september = extract_printed_figures(_header("2026-09.txt"))
    assert august and august.debit_interest_rate == Decimal("10.50")
    assert september and september.debit_interest_rate == Decimal("10.75")


def test_a_label_with_no_value_is_none_not_a_guess() -> None:
    # "Facility" is followed by another label, and "Fees" by nothing at all.
    text = "Statement Date\n30 June 2026\nFacility\nAvailable Credit\nFees\n"
    figures = extract_printed_figures(text)
    assert figures is not None
    assert figures.facility is None and figures.fees_total is None
    assert figures.statement_date == date(2026, 6, 30)


def test_a_statement_that_prints_none_gives_none() -> None:
    assert extract_printed_figures("") is None
    assert extract_printed_figures("Transaction detail\n1 Jun 2026\nSHOP\n100.00") is None


def test_a_percent_or_amount_in_the_wrong_place_is_not_read() -> None:
    text = "Facility\n10.50%\nDebit Interest rate\n50,000.00\n"
    assert extract_printed_figures(text) is None


def test_the_context_uses_each_statements_own_month() -> None:
    context = investec_context()
    assert context.debit_interest_rates["2026-08"] == Decimal("10.50")
    assert context.debit_interest_rates["2026-09"] == Decimal("10.75")
    assert context.facility == Decimal("50000.00")
    assert context.period_start == date(2026, 6, 1)
    assert context.period_end == date(2026, 10, 31)
    assert len(context.statement_fee_totals) == 5


def test_figures_from_two_accounts_are_never_mixed() -> None:
    rows = investec_figure_rows()
    rows[0] = {**rows[0], "account_id": "acc-2"}
    context = context_from_printed_figures(rows, "Account")
    assert context.debit_interest_rates == {}
    assert context.facility is None and context.card_purchases == {}
    assert context.account_label == "Account"


def test_a_statement_without_a_date_adds_nothing() -> None:
    rows = [{"account_id": "acc-1", "printed_figures": {"facility": "50000.00"}}]
    assert context_from_printed_figures(rows).facility is None


def test_malformed_stored_values_are_ignored() -> None:
    rows = [
        {
            "account_id": "acc-1",
            "printed_figures": {
                "statement_date": "2026-06-30",
                "debit_interest_rate": "not a number",
                "facility": "50000.00",
            },
        }
    ]
    context = context_from_printed_figures(rows)
    assert context.debit_interest_rates == {}
    assert context.facility == Decimal("50000.00")
