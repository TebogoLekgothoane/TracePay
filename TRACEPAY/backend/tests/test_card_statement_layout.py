"""A card statement whose payments received print their details above the dated line."""

from datetime import date
from decimal import Decimal

from categorisation.models import CategorisationResult
from leak_intelligence.models import FeatureTransaction
from leak_intelligence.statement_review import StatementContext, _implied_overdraft
from pdf_processor.statement_figures import extract_printed_figures
from pdf_processor.normalise import normalize_row, table_marks_debits_with_sign
from pdf_processor.tables import merge_continuation_rows

HEADERS = ["date", "card no.", "type", "details", "amount"]
ROWS = [
    ["15 Mar 2026", "***6190", "POS Purchase", "HPY*A13 Ottery", "- R120.00"],
    ["", "", "", "Inter account transfer from account...7378", ""],
    ["17 Mar 2026", "", "Transfer", "", "R21\xa0074.70"],
    ["", "", "", "Repay", ""],
    ["19 Mar 2026", "***6190", "POS Purchase", "Yoco   *PRASHAD GENERA Cape Town", "- R105.00"],
]


def test_details_printed_above_a_dated_row_belong_to_that_row() -> None:
    merged = merge_continuation_rows(ROWS, HEADERS)

    assert [row[3] for row in merged] == [
        "HPY*A13 Ottery",
        "Inter account transfer from account...7378 Repay",
        "Yoco   *PRASHAD GENERA Cape Town",
    ]


def test_a_wrapped_second_line_still_joins_the_row_above() -> None:
    rows = [
        ["15 Mar 2026", "***6190", "POS Purchase", "SASOL KING SHAKA", "- R726.12"],
        ["", "", "", "AIRPORT Tongaat", ""],
        ["17 Mar 2026", "***6190", "Online", "Takealot", "- R947.00"],
    ]

    merged = merge_continuation_rows(rows, HEADERS)

    assert merged[0][3] == "SASOL KING SHAKA AIRPORT Tongaat"
    assert merged[1][3] == "Takealot"


def test_unsigned_payment_with_a_transfer_type_is_a_credit() -> None:
    merged = merge_continuation_rows(ROWS, HEADERS)
    unsigned_is_credit = table_marks_debits_with_sign(merged, HEADERS)

    payment = normalize_row(merged[1], HEADERS, 2, unsigned_is_credit=unsigned_is_credit)

    assert unsigned_is_credit is True
    assert payment is not None
    assert payment.date == date(2026, 3, 17)
    assert payment.type == "credit"
    assert payment.amount == Decimal("21074.70")


def test_a_card_statement_prints_a_credit_limit() -> None:
    text = "Statement date\n4 April 2026\nCredit limit\nR117\xa0000.00\nMinimum amount due\nR449.85\n"

    figures = extract_printed_figures(text)

    assert figures is not None
    assert figures.credit_limit == Decimal("117000.00")
    assert figures.facility is None


def _interest(amount: str) -> FeatureTransaction:
    return FeatureTransaction(
        transaction_id="i1",
        user_id="user-a",
        amount=Decimal(amount),
        transaction_date=date(2026, 5, 4),
        description="Interest charged at 16.25%",
        transaction_type="debit",
        categorisation=CategorisationResult(
            category_name="Bank Fees",
            category_confidence=0.95,
            rule="description:service-fee",
            transaction_class="bank_fee",
            classification_confidence=0.95,
            classification_reason="test",
        ),
    )


def test_interest_on_a_card_is_not_called_overdraft_interest() -> None:
    card = _implied_overdraft([_interest("158.64")], StatementContext(credit_limit=Decimal("117000")), 1)
    account = _implied_overdraft([_interest("158.64")], StatementContext(facility=Decimal("20000")), 1)
    unknown = _implied_overdraft([_interest("158.64")], StatementContext(), 1)

    assert card is not None and account is not None and unknown is not None
    assert card.title == "Credit card interest"
    assert account.title == "Overdraft interest"
    assert unknown.title == "Overdraft interest"
    assert card.key == account.key == "overdraft_interest"


def test_extracted_rows_add_up_to_the_printed_balances() -> None:
    merged = merge_continuation_rows(ROWS, HEADERS)
    unsigned_is_credit = table_marks_debits_with_sign(merged, HEADERS)
    rows = [normalize_row(row, HEADERS, index, unsigned_is_credit=unsigned_is_credit) for index, row in enumerate(merged)]

    assert all(rows)
    assert sum(row.amount for row in rows) == Decimal("20849.70")
