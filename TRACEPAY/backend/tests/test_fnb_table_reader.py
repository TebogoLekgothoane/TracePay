"""FNB-style tables: description in a blank column, unsigned amounts, Cr/Dr markers."""

from datetime import date
from decimal import Decimal

from pdf_processor.normalise import normalize_row, parse_balance
from pdf_processor.statement_schema import printed_opening_balance
from pdf_processor.tables import align_row_to_headers, infer_directions_from_balances, is_summary_row

PERIOD = (date(2026, 7, 1), date(2026, 10, 6))
FNB_HEADERS = ["date", "", "description", "", "amount", "balance", "bank"]


def test_description_printed_in_the_blank_column_before_its_header_is_kept():
    row = ["14 Jul", "Payshapid Off-Us Example", "", "", "32.00", "1,592.86Cr", ""]
    aligned, headers = align_row_to_headers(row, FNB_HEADERS)
    assert headers == ["date", "description", "amount", "balance", "bank"]
    assert aligned[headers.index("description")] == "Payshapid Off-Us Example"
    assert aligned[headers.index("amount")] == "32.00"


def test_a_card_reference_on_the_right_is_not_taken_as_the_description():
    row = ["07 Jul", "POS Purchase KFC Ksa005 Market S", "", "479056*7701 05 Jul", "81.80", "2,503.94Cr", ""]
    aligned, headers = align_row_to_headers(row, FNB_HEADERS)
    assert aligned[headers.index("description")] == "POS Purchase KFC Ksa005 Market S"


def test_a_row_with_only_a_card_reference_keeps_it_rather_than_losing_the_row():
    row = ["07 Jul", "", "", "479056*7701 05 Jul", "81.80", "2,503.94Cr", ""]
    aligned, headers = align_row_to_headers(row, FNB_HEADERS)
    assert aligned[headers.index("description")] == "479056*7701 05 Jul"


FNB_SUMMARY = """Statement Balances
Opening Balance
2,488.74 Cr
Closing Balance
482.78 Dr
107.92 Dr
Total VAT (ZAR)
107.92 Dr
Bank Charges
Service Fees
532.63 Dr
Cash Deposit Fees
0.00
Cash Handling Fees
0.00
Other Fees
294.96 Dr
Interest Rate
Credit Rate**
Tiered
Debit Rate*
21.25%
Facility Limit
2,000.00
"""


def test_the_printed_fee_summary_is_read_with_its_marks():
    from pdf_processor.statement_figures import extract_printed_figures

    figures = extract_printed_figures(FNB_SUMMARY)
    assert figures is not None
    assert figures.service_fees == Decimal("532.63")
    assert figures.other_fees == Decimal("294.96")
    assert figures.vat == Decimal("107.92")
    # The statement's fee total is its printed fee lines; VAT is printed separately.
    assert figures.fees_total == Decimal("827.59")
    assert figures.debit_interest_rate == Decimal("21.25")
    assert figures.facility == Decimal("2000.00")


def test_balance_marker_sets_the_sign():
    assert parse_balance("1,592.86Cr") == Decimal("1592.86")
    assert parse_balance("482.78 Dr") == Decimal("-482.78")
    assert parse_balance("482.78Dr") == Decimal("-482.78")


def test_opening_balance_keeps_its_sign():
    assert printed_opening_balance("Opening Balance\n2,488.74 Cr\nClosing Balance") == Decimal("2488.74")
    assert printed_opening_balance("Opening Balance\n250.00 Dr\n") == Decimal("-250.00")


def test_balance_movement_decides_direction_for_unsigned_amounts():
    rows = [
        ["01 Jul", "Sale", "50.00", "950.00"],
        ["02 Jul", "Pay in", "100.00", "1050.00"],
    ]
    headers = ["date", "description", "amount", "balance"]
    out, out_headers = infer_directions_from_balances(rows, headers, Decimal("1000.00"))
    assert out_headers[-1] == "direction"
    assert [row[-1] for row in out] == ["debit", "credit"]


def test_a_row_that_fits_neither_direction_is_left_blank():
    rows = [["01 Jul", "Unclear", "10.00", "2000.00"]]
    out, _ = infer_directions_from_balances(rows, ["date", "description", "amount", "balance"], Decimal("1000.00"))
    assert out[0][-1] == ""


def test_an_overdrawn_balance_printed_without_its_marker_is_read_as_negative():
    # 1,197.88 - 3,050.00 = -1,852.12: the statement prints the overdraft with no "Dr".
    rows = [["25 Jul", "Payshapid Off-Us Example", "3,050.00", "1,852.12"]]
    out, _ = infer_directions_from_balances(rows, ["date", "description", "amount", "balance"], Decimal("1197.88"))
    assert out[0][-1] == "debit"
    assert out[0][3] == "1,852.12 Dr"
    assert parse_balance(out[0][3]) == Decimal("-1852.12")


def test_a_date_and_text_in_one_cell_are_split_but_a_year_is_not_taken_as_text():
    split, headers = align_row_to_headers(
        ["25 Aug Magtape Credit Tcps", "", "", "", "9,175.95Cr", "6,775.53Cr", ""], FNB_HEADERS
    )
    assert split[headers.index("date")] == "25 Aug"
    assert split[headers.index("description")] == "Magtape Credit Tcps"
    whole, headers = align_row_to_headers(
        ["25 Jul 2026", "SALARY ACME", "", "", "0.00", "32000.00", ""], FNB_HEADERS
    )
    assert whole[headers.index("date")] == "25 Jul 2026"
    assert whole[headers.index("description")] == "SALARY ACME"


def test_a_summary_line_is_recognised_so_it_is_not_counted_as_a_rejected_transaction():
    assert is_summary_row(["Closing Balance", "", "", "482.78Dr", "", ""])
    assert not is_summary_row(["25 Jul", "SALARY ACME", "", "22000.00", "", ""])


def test_a_marked_amount_is_not_overridden_by_the_balance():
    rows = [["01 Jul", "Transfer", "100.00Cr", "1100.00Cr"]]
    out, _ = infer_directions_from_balances(rows, ["date", "description", "amount", "balance"], Decimal("1000.00"))
    assert out[0][-1] == ""


def test_an_amount_marked_cr_is_money_in():
    headers = ["date", "description", "amount", "balance"]
    tx = normalize_row(["07 Jul", "FNB App Transfer From Example", "100.00Cr", "2,585.74Cr"], headers, 1, period=PERIOD)
    assert tx is not None
    assert tx.type == "credit"
    assert tx.amount == Decimal("100.00")
    assert tx.balance == Decimal("2585.74")


def test_an_unlabelled_small_charge_with_a_known_direction_is_kept():
    headers = ["date", "description", "amount", "balance", "direction"]
    tx = normalize_row(["06 Jul", "", "3.00", "2,485.74Cr", "debit"], headers, 1, period=PERIOD)
    assert tx is not None
    assert tx.type == "debit"
    assert tx.amount == Decimal("-3.00")


def test_an_unlabelled_row_without_a_direction_is_still_rejected():
    headers = ["date", "description", "amount", "balance", "direction"]
    assert normalize_row(["06 Jul", "", "3.00", "2,485.74Cr", ""], headers, 1, period=PERIOD) is None


def test_a_footer_with_no_amount_or_balance_is_still_rejected():
    headers = ["date", "description", "amount", "balance", "direction"]
    assert normalize_row(["06 Jul", "", "", "", "debit"], headers, 1, period=PERIOD) is None
