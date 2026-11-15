"""Reading printed text rows: the bank comes from the letterhead, and amounts stand apart.

The statements here are invented. They copy the layouts that broke real reads: a bank name
inside a counterparty, an SMS count in a fee description, account-style IDs glued to a
merchant, a date range in a notice, and the carried-forward rows that print a balance.
"""

from __future__ import annotations

from decimal import Decimal

from pdf_processor.normalise import parse_text_rows
from pdf_processor.statement_schema import resolve_extracted_statement

LETTERHEAD = [
    "Nedbank Limited",
    "Reg No. 0000/000000/00",
    "Statement period From : 01/05/2025 To : 31/05/2025",
    "Account Number: 1234567890",
]


def _statement(rows: list[str]) -> str:
    return "\n".join(LETTERHEAD + ["Date Transaction Debit Credit Balance"] + rows)


def test_bank_comes_from_the_letterhead_not_a_counterparty_name() -> None:
    text = _statement(
        [
            "02/05/2025 CAPITEC N EXAMPLE R 500,00 R 1 000,00",
            "03/05/2025 SHOP 517992001175 R -45,00 R 955,00",
        ]
    )
    statement = resolve_extracted_statement(text, [])
    assert statement.bank == "Nedbank"


def test_bank_falls_back_to_the_filename_when_the_letterhead_is_unreadable() -> None:
    text = _statement(["02/05/2025 SHOP R -45,00 R 955,00"]).replace("Nedbank Limited", "")
    statement = resolve_extracted_statement(text, [], source_filename="nedbank-may.pdf")
    assert statement.bank == "Nedbank"


def test_fee_description_number_is_not_the_amount() -> None:
    rows = parse_text_rows(_statement(["27/05/2025 Service Fee -7SMS R -3,50 R 181,69"]))[0]
    assert [str(row.amount) for row in rows] == ["-3.50"]


def test_account_style_id_glued_to_an_amount_is_not_the_amount() -> None:
    rows = parse_text_rows(_statement(["09/05/2025 PURCHASE 20.00-5179920 R -51,98 R 2 400,29"]))[0]
    assert [str(row.amount) for row in rows] == ["-51.98"]


def test_date_range_in_a_notice_is_not_an_amount() -> None:
    rows, _ = parse_text_rows(_statement(["25/05/2025 VAT 25/04-27/05 = R8.05 R 0,00 R 1 000,00"]))
    assert rows == []


def test_r_prefixed_signed_amount_is_read() -> None:
    rows = parse_text_rows(_statement(["04/05/2025 Grocer R -120,00 R 880,00"]))[0]
    assert [row.amount for row in rows] == [Decimal("-120.00")]


def test_unsigned_credit_is_read_when_the_balance_chain_proves_it() -> None:
    rows = parse_text_rows(
        _statement(
            [
                "30/04/2025 BROUGHT FORWARD R 0,00 R 335,97",
                "02/05/2025 Deposit Example R 500,00 R 835,97",
                "02/05/2025 Grocer R -127,90 R 708,07",
            ]
        )
    )[0]
    assert [(row.description, row.amount, row.type) for row in rows] == [
        ("Deposit Example", Decimal("500.00"), "credit"),
        ("Grocer", Decimal("-127.90"), "debit"),
    ]


def test_unsigned_amount_is_not_taken_when_the_balance_does_not_confirm_it() -> None:
    rows, _ = parse_text_rows(
        _statement(
            [
                "30/04/2025 BROUGHT FORWARD R 0,00 R 335,97",
                "02/05/2025 Deposit Example R 500,00 R 999,99",
            ]
        )
    )
    assert rows == []


def test_overdrawn_balance_is_read_as_a_balance_not_a_second_amount() -> None:
    rows = parse_text_rows(
        _statement(
            [
                "08/06/2025 Shop R -2,00 R 3,09",
                "09/06/2025 Fee R -10,00 R -6,91",
            ]
        )
    )[0]
    assert [row.amount for row in rows] == [Decimal("-2.00"), Decimal("-10.00")]


def test_row_with_an_unreadable_balance_is_recovered_from_the_balances_around_it() -> None:
    rows = parse_text_rows(
        _statement(
            [
                "30/04/2025 BROUGHT FORWARD R 0,00 R 335,97",
                "02/05/2025 Deposit Example R 500,00 R 83597",
                "02/05/2025 Grocer R -127,90 R 708,07",
            ]
        )
    )[0]
    assert [(row.description, row.amount) for row in rows] == [
        ("Deposit Example", Decimal("500.00")),
        ("Grocer", Decimal("-127.90")),
    ]


def test_row_with_an_unreadable_balance_is_not_recovered_when_the_balances_do_not_add_up() -> None:
    rows = parse_text_rows(
        _statement(
            [
                "30/04/2025 BROUGHT FORWARD R 0,00 R 335,97",
                "02/05/2025 Deposit Example R 500,00 R 83597",
                "02/05/2025 Grocer R -100,00 R 708,07",
            ]
        )
    )[0]
    assert [row.description for row in rows] == ["Grocer"]


def test_two_unreadable_rows_are_kept_only_if_one_reading_fits_the_balances() -> None:
    # +300 and +300 would give 935.97 and -300 / +300 gives 335.97: only the first fits 935.97.
    rows = parse_text_rows(
        _statement(
            [
                "30/04/2025 BROUGHT FORWARD R 0,00 R 335,97",
                "02/05/2025 Deposit A R 300,00 R 6x",
                "02/05/2025 Deposit B R 300,00 R 9x",
                "03/05/2025 Grocer R -10,00 R 925,97",
            ]
        )
    )[0]
    assert [(row.description, row.amount) for row in rows] == [
        ("Deposit A", Decimal("300.00")),
        ("Deposit B", Decimal("300.00")),
        ("Grocer", Decimal("-10.00")),
    ]


def test_period_is_read_when_ocr_splits_from_and_to_onto_separate_lines() -> None:
    text = "\n".join(
        [
            "Nedbank Limited",
            "06 AUGUST 2025",
            "Statement period",
            "01/05/2025 EXAMPLE From ..",
            "TO 06/08/2025",
            "Date Transaction Debit Credit Balance",
            "02/05/2025 Grocer R -45,00 R 955,00",
        ]
    )
    statement = resolve_extracted_statement(text, [])
    assert (str(statement.statement_start_date), str(statement.statement_end_date)) == (
        "2025-05-01",
        "2025-08-06",
    )
    assert statement.period_source == "declared"


def test_opening_and_closing_balance_are_read_from_the_carry_rows() -> None:
    text = _statement(
        [
            "30/04/2025 BROUGHT FORWARD R 0,00 R 335,97",
            "02/05/2025 Grocer R -35,97 R 300,00",
            "05/05/2025 CARRIED FORWARD R 0,00 R 300,00",
        ]
    )
    statement = resolve_extracted_statement(text, [])
    assert statement.opening_balance == Decimal("335.97")
    assert statement.closing_balance == Decimal("300.00")


def test_a_dated_header_line_does_not_hide_the_opening_balance() -> None:
    text = "\n".join(
        [
            "Nedbank Limited",
            "Statement period",
            "01/05/2025 EXAMPLE From ..",
            "TO 06/08/2025",
            "30/04/2025 BROUGHT FORWARD R 0,00 R 335,97",
            "02/05/2025 Grocer R -35,97 R 300,00",
        ]
    )
    assert resolve_extracted_statement(text, []).opening_balance == Decimal("335.97")


def test_a_carry_row_at_a_page_break_is_not_the_closing_balance() -> None:
    text = _statement(
        [
            "30/04/2025 BROUGHT FORWARD R 0,00 R 335,97",
            "02/05/2025 CARRIED FORWARD R 0,00 R 335,97",
            "02/05/2025 BROUGHT FORWARD R 0,00 R 335,97",
            "03/05/2025 Grocer R -35,97 R 300,00",
        ]
    )
    assert resolve_extracted_statement(text, []).closing_balance is None


def test_a_balance_is_recorded_only_when_the_chain_proved_it() -> None:
    rows = parse_text_rows(
        _statement(
            [
                "30/04/2025 BROUGHT FORWARD R 0,00 R 335,97",
                "02/05/2025 Grocer R -35,97 R 300,00",  # proven: 335.97 - 35.97
                "03/05/2025 Cafe R -50,00 R 83597",  # garbled balance: accepted by its sign only
                "04/05/2025 Taxi R -100,00 R 150,00",  # 300 - 50 - 100: the rows prove it
            ]
        )
    )[0]
    # The garbled figure is never recorded. Taxi's figure is, because the rows add up to it.
    assert [row.balance for row in rows] == [Decimal("300.00"), None, Decimal("150.00")]


def test_a_row_the_second_engine_read_is_added_only_where_the_balances_prove_a_gap() -> None:
    first = _statement(
        [
            "30/04/2025 BROUGHT FORWARD R 0,00 R 335,97",
            "02/05/2025 Grocer R -35,97 R 300,00",
            "04/05/2025 Cafe R -50,00 R 150,00",  # 300 - 50 is 250, not 150: a row is missing
        ]
    )
    second = _statement(
        [
            "30/04/2025 BROUGHT FORWARD R 0,00 R 335,97",
            "02/05/2025 Grocer R -35,97 R 300,00",
            "03/05/2025 Taxi R -100,00 R 200,00",  # closes the gap exactly
            "03/05/2025 Ghost R -100,00 R 200,00",  # same figures: only one can close it
            "04/05/2025 Cafe R -50,00 R 150,00",
        ]
    )
    other = parse_text_rows(second)[0]
    merged = parse_text_rows(first, extra_rows=other)[0]
    assert [(row.description, str(row.amount)) for row in merged] == [
        ("Grocer", "-35.97"),
        ("Taxi", "-100.00"),
        ("Cafe", "-50.00"),
    ]
    assert "row_recovered_from_second_ocr_engine" in merged[1].date_warnings
    assert [row.balance for row in merged] == [Decimal("300.00"), Decimal("200.00"), Decimal("150.00")]


def test_an_undated_row_is_dated_by_its_neighbours_when_the_chain_proves_it() -> None:
    rows = parse_text_rows(
        _statement(
            [
                "30/04/2025 BROUGHT FORWARD R 0,00 R 335,97",
                "19/05/2025 Grocer R -35,97 R 300,00",
                "/05/2025 Boutique R -100,00 R 200,00",  # the OCR lost the day
                "19/05/2025 Cafe R -50,00 R 150,00",
            ]
        )
    )[0]
    assert [(row.description, str(row.amount), str(row.date)) for row in rows] == [
        ("Grocer", "-35.97", "2025-05-19"),
        ("Boutique", "-100.00", "2025-05-19"),
        ("Cafe", "-50.00", "2025-05-19"),
    ]
    assert rows[1].date_confidence == "medium"
    assert "date_taken_from_neighbouring_rows" in rows[1].date_warnings


def test_an_undated_row_between_different_dates_is_listed_not_guessed() -> None:
    from pdf_processor.normalise import unparsed_text_rows

    text = _statement(
        [
            "30/04/2025 BROUGHT FORWARD R 0,00 R 335,97",
            "18/05/2025 Grocer R -35,97 R 300,00",
            "Boutique R -100,00 R 200,00",  # no date at all; neighbours differ
            "19/05/2025 Cafe R -50,00 R 150,00",
        ]
    )
    rows, detected = parse_text_rows(text)
    assert [row.description for row in rows] == ["Grocer", "Cafe"]
    assert detected == 4
    assert [line.split()[0] for _n, line in unparsed_text_rows(text, rows)] == ["Boutique"]


def test_on_a_statement_that_signs_its_debits_an_unsigned_amount_is_never_a_debit() -> None:
    # Every debit below carries a minus. "500,00" with a balance that has lost its thousands
    # digit (196,58 for 1 196,58) would chain as a debit; the printed convention says credit.
    rows = parse_text_rows(
        _statement(
            [
                "30/04/2025 BROUGHT FORWARD R 0,00 R 696,58",
                "01/05/2025 Shop A R -10,00 R 686,58",
                "02/05/2025 Shop B R -10,00 R 676,58",
                "03/05/2025 Shop C R -10,00 R 666,58",
                "04/05/2025 Shop D R -10,00 R 656,58",
                "08/05/2025 N EXAMPLE R 500,00 R 156,58",  # misread balance, unsigned amount
                "09/05/2025 Shop E R -32,00 R 124,58",
            ]
        )
    )[0]
    by_name = {row.description: row for row in rows}
    assert "N EXAMPLE" not in by_name  # not proven either way: handed back, never a debit
    assert by_name["Shop E"].amount == Decimal("-32.00")


def test_a_statement_without_signed_debits_still_reads_by_the_balance_chain() -> None:
    rows = parse_text_rows(
        _statement(
            [
                "30/04/2025 BROUGHT FORWARD R 0,00 R 700,00",
                "01/05/2025 Shop A R 100,00 R 600,00",
                "02/05/2025 Deposit R 50,00 R 650,00",
            ]
        )
    )[0]
    assert [str(row.amount) for row in rows] == ["-100.00", "50.00"]


def test_a_neighbour_dated_row_follows_its_neighbours_after_their_days_are_repaired() -> None:
    rows = parse_text_rows(
        _statement(
            [
                "30/04/2025 BROUGHT FORWARD R 0,00 R 1 000,00",
                "23/05/2025 Shop A R -100,00 R 900,00",
                "4/05/2025 Shop B R -100,00 R 800,00",  # 24 May with its first digit lost
                "/05/2025 Shop C R -100,00 R 700,00",  # undated: sits between 24 May rows
                "4/05/2025 Shop D R -100,00 R 600,00",
                "26/05/2025 Shop E R -100,00 R 500,00",
            ]
        )
    )[0]
    assert [(row.description, row.date.day) for row in rows] == [
        ("Shop A", 23),
        ("Shop B", 24),
        ("Shop C", 24),
        ("Shop D", 24),
        ("Shop E", 26),
    ]


def test_a_balance_with_a_leading_zero_is_not_trusted() -> None:
    # "077,34" is "2 077,34" with its thousands lost: the chain must not run through it.
    rows = parse_text_rows(
        _statement(
            [
                "30/04/2025 BROUGHT FORWARD R 0,00 R 2 127,34",
                "17/05/2025 Shop R -50,00 R 077,34",
                "17/05/2025 Shop R -26,00 R 051,34",
            ]
        )
    )[0]
    assert [row.balance for row in rows] == [None, None]
    assert [str(row.amount) for row in rows] == ["-50.00", "-26.00"]


def test_rows_that_could_not_be_proven_are_handed_back_not_dropped() -> None:
    from pdf_processor.normalise import unparsed_text_rows

    text = _statement(
        [
            "30/04/2025 BROUGHT FORWARD R 0,00 R 335,97",
            "02/05/2025 Deposit Example R 500,00 R 99x",
            "02/05/2025 Grocer R -127,90 R 700,00",
            "25/05/2025 VAT 25/04-27/05 = R8.05 R 0,00 R 700,00",
        ]
    )
    rows, _ = parse_text_rows(text)
    handed_back = unparsed_text_rows(text, rows)
    # The balances do not prove the deposit (700.00 + 127.90 - 335.97 is not 500), so it is listed.
    assert [line.split()[1] for _n, line in handed_back] == ["Deposit"]


def test_doubled_minus_and_spaced_cents_are_tidied() -> None:
    rows = parse_text_rows(
        _statement(
            [
                "31/07/2025 Prepaid Airtime --1,50 R 173,49",
                "01/08/2025 Transfer out R -20, 00 R 153,49",
            ]
        )
    )[0]
    assert [row.amount for row in rows] == [Decimal("-1.50"), Decimal("-20.00")]


def test_dropped_day_digit_is_restored_from_the_order_of_the_rows() -> None:
    rows = parse_text_rows(
        _statement(
            [
                "23/05/2025 Shop A R -10,00",
                "4/05/2025 Shop B R -20,00",
                "26/05/2025 Shop C R -30,00",
            ]
        )
    )[0]
    assert [row.date.day for row in rows] == [23, 24, 26]
    assert rows[1].date_confidence == "medium"
    assert "day_digit_restored_from_order" in rows[1].date_warnings


def test_in_order_single_digit_day_is_left_alone() -> None:
    rows = parse_text_rows(
        _statement(
            [
                "1/05/2025 Shop A R -10,00",
                "2/05/2025 Shop B R -20,00",
                "13/05/2025 Shop C R -30,00",
            ]
        )
    )[0]
    assert [row.date.day for row in rows] == [1, 2, 13]


def test_ambiguous_dropped_day_digit_is_not_guessed() -> None:
    rows = parse_text_rows(
        _statement(
            [
                "03/05/2025 Shop A R -10,00",
                "4/05/2025 Shop B R -20,00",
                "30/05/2025 Shop C R -30,00",
            ]
        )
    )[0]
    # 4 May is in order here, so it stays; nothing is guessed.
    assert [row.date.day for row in rows] == [3, 4, 30]


def test_ocr_row_is_read_left_to_right_on_a_skewed_scan() -> None:
    from pdf_processor.ocr import _lines_from_ocr_items

    # One row whose right-hand columns sit slightly higher, as on a tilted scan.
    boxes = [
        [300, 110, 380, 125],  # amount, lowest
        [10, 108, 90, 123],  # date, left
        [500, 100, 580, 115],  # balance, highest
        [120, 109, 280, 124],  # description
    ]
    texts = ["-45,00", "02/05/2025", "955,00", "Grocer"]
    assert _lines_from_ocr_items(texts, boxes) == "02/05/2025 Grocer -45,00 955,00"


def test_carried_and_brought_forward_rows_are_never_transactions() -> None:
    rows, detected = parse_text_rows(
        _statement(
            [
                "30/04/2025 BROUGHT FORWARD R 0,00 R 335,97",
                "31/05/2025 CARRIED FORWARD R 0,00 R 388,71",
                "31/05/2025 PROVISIONAL STATEMENT R 0,00 R 0,00",
            ]
        )
    )
    assert rows == []
    assert detected == 3
