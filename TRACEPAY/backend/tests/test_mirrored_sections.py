from pdf_processor.mirrored_sections import drop_mirrored_text, has_mirrored_sections, is_mirror_table

STATEMENT = """Transaction detail
1 Oct 2026 30 Sep 2026 Monthly service charge 705.00
Closing Balance
Online payments, deposits, fees and interest
Trans Date Description Fees Debit Credit
30 Sep 2026 Monthly service charge 705.00 ~
Card transactions CARD HOLDER 1
30 Aug 2026 DL*Uber Eats CPT ZA 175.65
"""


def test_repeated_summary_sections_are_dropped():
    assert has_mirrored_sections(STATEMENT)
    kept = drop_mirrored_text(STATEMENT)
    assert kept.count("Monthly service charge") == 1
    assert "Uber Eats" not in kept


def test_ordinary_statement_is_untouched():
    text = "Transaction detail\n1 Oct 2026 Shop 10.00\n"
    assert not has_mirrored_sections(text)
    assert drop_mirrored_text(text) == text


def test_mirror_tables_have_fees_column_and_no_balance():
    assert is_mirror_table(["Trans Date", "Description", "Fees", "Debit", "Credit"])
    assert not is_mirror_table(["Posted Date", "Description", "Debit", "Credit", "Balance"])
