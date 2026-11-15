"""Fill descriptions the text layer did not contain.

Some statements draw the narration (a fee name) as vectors, so the text layer has the date,
the amount and the balance, and nothing else. Others keep the narration but the table reader
saves only the reference number. A card purchase also prints a second date, the day the card
was used, in a column the table reader drops.

The stored description is replaced only when it says nothing: the empty-cell placeholder, or
a reference made only of digits whose visual row contains those digits and a name. A
description that already names the payment is left as it is. The card date is kept on
``booking_date`` when that field is empty.
"""

from __future__ import annotations

import io
import re
from datetime import date

from pdf_processor.models import Transaction

_PLACEHOLDER = "no description printed"
_MONEY = re.compile(r"^(\d{1,3}(?:,\d{3})*|\d+)\.\d{2}(Cr|Dr)?$", re.IGNORECASE)
_MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


def narration_to_use(stored: str, visual: str) -> str | None:
    """The visual narration when it should replace what was stored, else nothing."""
    stored_text = (stored or "").strip()
    raw = " ".join((visual or "").split())
    visual_text = _clean_narration(raw)
    if not _readable(visual_text):
        return None
    if stored_text.casefold() == _PLACEHOLDER:
        return visual_text[:500]
    if stored_text.isdigit() and stored_text in raw:
        return visual_text[:500]
    return None


def _clean_narration(text: str) -> str:
    """Drop the date and the purchase a fee line was read beside."""
    cleaned = re.sub(r"^[^A-Za-z#]+", "", text)
    cleaned = re.sub(r"^(?:[lI]\d{1,2})\s+", "", cleaned)
    cleaned = re.sub(r"[-–]\s*\d[\d,]*[.,]\d{2}\b.*$", "", cleaned)
    if "#" in cleaned or re.search(r"\bfee", cleaned, re.IGNORECASE):
        cleaned = re.sub(r"\b\d{6,}\b", "", cleaned)
    return " ".join(cleaned.split()).strip(" -|.")


def _readable(text: str) -> bool:
    folded = text.strip().casefold()
    if folded in {"fee", "fees"}:
        return True
    letters = sum(character.isalpha() for character in text)
    digits = sum(character.isdigit() for character in text)
    return letters >= 6 and letters >= digits


def recover_descriptions(content: bytes, transactions: list[Transaction]) -> list[Transaction]:
    """Return the transactions with unreadable descriptions filled from the page."""
    if not content or not transactions:
        return transactions
    try:
        import fitz
    except ImportError:
        return transactions
    try:
        document = fitz.open(stream=content, filetype="pdf")
    except Exception:  # noqa: BLE001 - a PDF that will not open is left as it was read
        return transactions
    try:
        rows = _visual_rows(document)
    except Exception:  # noqa: BLE001 - recovery is optional; the statement still stands
        return transactions
    finally:
        document.close()
    return _apply(transactions, rows)


def _visual_rows(document) -> list[_Row]:
    pending: list[tuple[object, list[_Row]]] = []
    rows: list[_Row] = []
    for page in document:
        page_rows = _rows_from_words(page.get_text("words") or [])
        pending.append((page, page_rows))
        rows.extend(page_rows)
    if any(row.needs_ocr for row in rows):
        for page, page_rows in pending:
            if not any(row.needs_ocr for row in page_rows):
                continue
            words = _ocr_words(page)
            for row in page_rows:
                if row.needs_ocr:
                    row.narration = _ocr_narration(words, row)
    return rows


class _Row:
    def __init__(self, day: int, month: int, amounts: list, narration: str, auth: date | None, y: float, amount_x: float) -> None:
        self.day = day
        self.month = month
        self.amounts = amounts
        self.narration = narration
        self.auth = auth
        self.y = y
        self.amount_x = amount_x

    @property
    def needs_ocr(self) -> bool:
        return not _readable(self.narration)


def _rows_from_words(words: list) -> list[_Row]:
    rows: list[_Row] = []
    for cluster in _clusters(words):
        parsed = _parse_cluster(cluster)
        if parsed is not None:
            rows.append(parsed)
    return rows


def _clusters(words: list) -> list[list]:
    ordered = sorted(words, key=lambda word: (word[1], word[0]))
    clusters: list[list] = []
    current: list = []
    anchor = None
    for word in ordered:
        if anchor is None or abs(word[1] - anchor) <= 2.5:
            current.append(word)
            anchor = word[1] if anchor is None else anchor
        else:
            clusters.append(current)
            current = [word]
            anchor = word[1]
    if current:
        clusters.append(current)
    return clusters


def _parse_cluster(words: list) -> _Row | None:
    ordered = sorted(words, key=lambda word: word[0])
    posting = _leading_date(ordered)
    if posting is None:
        return None
    day, month, date_end = posting
    money = [(word[0], _money(word[4])) for word in ordered if _money(word[4]) is not None]
    if not money:
        return None
    balance_x = next((x for x, value in money if str(value[1])), money[-1][0])
    amounts = [value[0] for x, value in money if x < balance_x - 1]
    if not amounts:
        amounts = [money[0][1][0]]
    narration_words = []
    auth = None
    index = 0
    while index < len(ordered):
        word = ordered[index]
        if word[0] <= date_end or _money(word[4]) is not None:
            index += 1
            continue
        month_number = _MONTHS.get(word[4][:3].lower())
        previous_day = _day(ordered[index - 1][4]) if index else None
        if month_number and previous_day and ordered[index - 1][0] > date_end:
            auth = (previous_day, month_number)
            if narration_words and narration_words[-1] == ordered[index - 1][4]:
                narration_words.pop()
            index += 1
            continue
        narration_words.append(word[4])
        index += 1
    return _Row(
        day,
        month,
        amounts,
        " ".join(narration_words),
        auth,
        ordered[0][1],
        min(x for x, _value in money),
    )


def _leading_date(words: list) -> tuple[int, int, float] | None:
    for index, word in enumerate(words[:-1]):
        if word[0] > 120:
            return None
        day = _day(word[4])
        month = _MONTHS.get(words[index + 1][4][:3].lower())
        if day and month:
            return day, month, words[index + 1][2]
    return None


def _day(text: str) -> int | None:
    if text.isdigit() and 1 <= int(text) <= 31:
        return int(text)
    return None


def _money(text: str) -> tuple[str, str] | None:
    match = _MONEY.match(text.replace(" ", ""))
    if not match:
        return None
    suffix = match.group(2) or ""
    amount = match.group(0)[: -len(suffix)] if suffix else match.group(0)
    return amount.replace(",", ""), suffix


def _ocr_words(page) -> list[tuple[float, float, str]]:
    try:
        import pytesseract
        from PIL import Image

        from pdf_processor.ocr import _locate_tesseract
    except ImportError:
        return []
    binary = _locate_tesseract()
    if not binary:
        return []
    pytesseract.pytesseract.tesseract_cmd = binary
    try:
        import fitz

        pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        image = Image.open(io.BytesIO(pixmap.tobytes("png")))
        data = pytesseract.image_to_data(image, config="--psm 6", output_type=pytesseract.Output.DICT)
    except Exception:  # noqa: BLE001 - OCR is a fallback; the placeholder stays if it fails
        return []
    words = []
    for index, text in enumerate(data.get("text", [])):
        cleaned = str(text).strip().lstrip("|").strip()
        if not cleaned:
            continue
        try:
            confidence = float(data["conf"][index])
        except (TypeError, ValueError):
            continue
        if confidence < 40:
            continue
        words.append((float(data["left"][index]) / 2, float(data["top"][index]) / 2, cleaned))
    return words


def _ocr_narration(words: list[tuple[float, float, str]], row: _Row) -> str:
    kept = [
        text
        for x, y, text in words
        if abs(y - row.y) <= 6 and x < row.amount_x and _money(text) is None and _MONTHS.get(text[:3].lower()) is None and not _day(text)
    ]
    return " ".join(kept)


def _apply(transactions: list[Transaction], rows: list[_Row]) -> list[Transaction]:
    from decimal import Decimal

    cursor = 0
    updated: list[Transaction] = []
    for transaction in transactions:
        match_at = None
        for index in range(cursor, min(cursor + 8, len(rows))):
            row = rows[index]
            if row.day != transaction.date.day or row.month != transaction.date.month:
                continue
            if any(abs(Decimal(amount) - abs(transaction.amount)) <= Decimal("0.01") for amount in row.amounts):
                match_at = index
                break
        if match_at is None:
            updated.append(transaction)
            continue
        cursor = match_at + 1
        row = rows[match_at]
        changes: dict = {}
        replacement = narration_to_use(transaction.description, row.narration)
        if replacement and replacement != transaction.description:
            changes["description"] = replacement
        auth = _auth_date(row.auth, transaction.date) if transaction.booking_date is None else None
        if auth is not None:
            changes["booking_date"] = auth
        updated.append(transaction.model_copy(update=changes) if changes else transaction)
    return updated


def _auth_date(auth: tuple[int, int] | None, posted: date) -> date | None:
    if auth is None:
        return None
    day, month = auth
    for year in (posted.year, posted.year - 1):
        try:
            candidate = date(year, month, day)
        except ValueError:
            continue
        if candidate < posted and (posted - candidate).days <= 10:
            return candidate
    return None
