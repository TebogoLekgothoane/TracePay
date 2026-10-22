"""Balance-chain proof on real GoTyme pages, and what the import dedupe does to them."""

from decimal import Decimal
from pathlib import Path
import re

from pdf_processor.gotyme_text import ChainRow, parse_gotyme_text

FIXTURE = Path(__file__).parent / "fixtures" / "gotyme_pages_7_8.txt"


def _legacy_dedupe_key(row: ChainRow) -> str:
    """Python mirror of mobile ``buildTransactionDedupeKey`` (account omitted)."""
    kind = "credit" if row.credit else "debit"
    amount = abs(row.credit or row.debit or row.fee or Decimal("0"))
    description = re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", row.description.lower())).strip()
    return f"{row.date}|{kind}|{amount:.2f}|{description}"


def _chain_breaks(rows: list[ChainRow]) -> int:
    breaks, previous = 0, None
    for row in rows:
        if previous is not None and abs(previous + row.movement - row.balance) > Decimal("0.01"):
            breaks += 1
        previous = row.balance
    return breaks


def test_real_pages_parse_and_the_balance_chain_closes_across_the_page_break() -> None:
    parse = parse_gotyme_text(FIXTURE.read_text(encoding="utf-8"))
    assert parse.unresolved == []
    assert len(parse.rows) == 36
    assert parse.mismatches == []
    assert parse.rows[0].balance == Decimal("13.89")
    assert parse.rows[-1].balance == Decimal("3.39")
    # Fee column rows are fees, reversals are credits, not payments.
    fees = [row for row in parse.rows if row.fee]
    assert len(fees) == 7 and all(row.fee == Decimal("0.50") for row in fees)
    assert sum(1 for row in parse.rows if row.description.startswith("Fee Reversal")) == 6


def test_dedupe_by_date_amount_description_deletes_genuine_repeated_rows() -> None:
    rows = parse_gotyme_text(FIXTURE.read_text(encoding="utf-8")).rows
    seen: set[str] = set()
    kept: list[ChainRow] = []
    for row in rows:
        key = _legacy_dedupe_key(row)
        if key not in seen:
            seen.add(key)
            kept.append(row)
    lost = len(rows) - len(kept)
    # These repeats are real: the printed balance only closes with every row.
    assert lost == 20
    assert _chain_breaks(rows) == 0
    assert _chain_breaks(kept) > 0


# PyMuPDF layout: one cell per line, header cells on separate lines, and a
# footer block from the e-stamp to "Page N of M". Wrapped details sit between
# the date and the four numeric cells (fee, credit, debit, balance).
_PYMUPDF_PAGES = """Current account
Date
Details
Fees*(-)
Credits (+)
Debits (-)
Running Balance
15 Jun 2026
Fee: VAS - Mobile Purchase for 0600000000 Airtime
0.50
-
-
434.59
15 Jun 2026
Int Purchase, with card at EPOS at OPENAI *CHATGPT
SUBSCR +14158799686 US
-
-
149
285.59
GoTyme Bank
e-Stamp
20 Oct 2026
Branch: 000000
1 Example Avenue, Rosebank 2196
www.gotyme.co.za
Bank Statement
You can contact our Customer Success Team through any of these
Date requested:
20 Oct 2026
*All bank fees are inclusive of VAT at 15%.
All figures are in ZAR.
Page 1 of 2

Date
Details
Fees*(-)
Credits (+)
Debits (-)
Running Balance
15 Aug 2026
PayShap - Pay by Account, Example
-
-
266.09
19.50
15 Sep 2026
Fee: Unsuccessful Int Recurring Payment from OPENAI
*CHATGPT SUBSCR +14158799686 US for ZAR149.00. Amount
R149.00 Ref 625811809778 - insufficient funds
10
-
-
9.50
23 Sep 2026
Card replacement fee
5
-
-
4.50
24 Sep 2026
Money transferred out from GoalSave 50000000000
-
300
-
304.50
Page 2 of 2
"""


def test_pymupdf_layout_keeps_wrapped_chatgpt_rows_whole() -> None:
    from pdf_processor.gotyme_text import gotyme_transactions

    text = _PYMUPDF_PAGES
    parse = parse_gotyme_text(text)
    assert (len(parse.rows), parse.mismatches, parse.unresolved) == (6, [], [])

    transactions = gotyme_transactions(text)
    assert transactions is not None
    by_date = {(t.date.isoformat(), t.amount): t for t in transactions}
    payment = by_date[("2026-06-15", Decimal("-149"))]
    assert payment.description == "Int Purchase, with card at EPOS at OPENAI CHATGPT SUBSCR +14158799686 US"
    failed = by_date[("2026-09-15", Decimal("-10"))]
    assert failed.description.startswith("Fee: Unsuccessful Int Recurring Payment from OPENAI")
    assert failed.description.endswith("insufficient funds")
    # Footer address lines never leak into a description.
    assert not any("Example Avenue" in t.description or "Bank Statement" in t.description for t in transactions)
    assert by_date[("2026-09-24", Decimal("300"))].type == "credit"

    rows = {row.description: row for row in parse.rows}
    # Printed in the Fees column, so a fee even though the wording does not start with "Fee".
    assert (rows["Card replacement fee"].fee, rows["Card replacement fee"].debit) == (Decimal("5"), None)


def test_gotyme_chain_is_not_used_when_a_row_breaks_it() -> None:
    from pdf_processor.gotyme_text import gotyme_transactions

    broken = _PYMUPDF_PAGES.replace("9.50\n23 Sep", "9.40\n23 Sep")
    assert gotyme_transactions(broken) is None
