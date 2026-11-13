"""Structure of a card or payment-link statement descriptor.

Statement lines such as ``Yoco *Moro Gelato Wi Cape Town`` or ``HELLO ASIA SUPERSTORE SEA POINT
Inter account [REDACTED] from account...7378`` mix four things: a payment processor, the
merchant's trading name, a location the bank appended, and sometimes bank wording about the
account. Only the trading name identifies the business, so everything else is separated out:

- the shared directory keys on the trading name, so the same shop paid by card, Yoco or PayFast,
  or in another suburb, is one entry;
- the merchant label shown to the user is the trading name, not "Yoco Moro Gelato Wi Cape";
- account wording is dropped before any key is built, so it can never be stored.

Parsing is deliberately conservative: only listed processors and listed places are stripped, and a
trailing word is never removed when nothing would be left.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# Processors that put the merchant after "*" (or a space). Matched on the raw text.
_PROCESSORS: tuple[str, ...] = (
    "YOCO",
    "PAYFAST",
    "PAYU",
    "PAYSTACK",
    "OZOW",
    "SNAPSCAN",
    "ZAPPER",
    "IKHOKHA",
    "PEACH PAYMENTS",
    "SUMUP",
    "SHOPIFY",
    "PAYGATE",
    "NETCASH",
)
_PROCESSOR_RE = re.compile(
    r"^\s*(?P<processor>" + "|".join(re.escape(item) for item in _PROCESSORS) + r")\s*\*\s*(?P<rest>.+)$",
    flags=re.IGNORECASE,
)

# Bank wording appended after the merchant on some card lines. Everything from here is dropped.
_ACCOUNT_TAIL_RE = re.compile(r"\s+(?:INTER[\s-]?ACCOUNT|FROM ACCOUNT|TO ACCOUNT)\b.*$", flags=re.IGNORECASE)
_BRANCH_RE = re.compile(r"\(\s*\d{2,6}\s*\)")
_SPACE_RE = re.compile(r"\s+")

# Places a bank appends to a merchant name. Ambiguous words that are also common names or brand
# words (George, Brooklyn, Gardens, Observatory, Melville) are deliberately left out.
_LOCATIONS: tuple[str, ...] = (
    "CAPE TOWN", "SEA POINT", "GREEN POINT", "STELLENBOSCH", "SANDTON", "DURBAN", "PRETORIA",
    "JOHANNESBURG", "GOODWOOD", "RONDEBOSCH", "CAVENDISH", "CLAREMONT", "WOODSTOCK", "BELLVILLE",
    "CENTURY CITY", "OTTERY", "WYNBERG", "CONSTANTIA", "CAMPS BAY", "WATERFRONT", "TABLE VIEW",
    "PAROW", "SOMERSET WEST", "PAARL", "GQEBERHA", "PORT ELIZABETH", "EAST LONDON", "BLOEMFONTEIN",
    "MIDRAND", "CENTURION", "RANDBURG", "ROSEBANK", "UMHLANGA", "PIETERMARITZBURG", "POLOKWANE",
    "NELSPRUIT", "KIMBERLEY", "MTHATHA", "KNYSNA", "HERMANUS", "DURBANVILLE", "MILNERTON",
    "MOWBRAY", "KENILWORTH", "PLUMSTEAD", "TOKAI", "MUIZENBERG", "FISH HOEK", "SIMONS TOWN",
    "KALK BAY", "HOUT BAY", "BLOUBERGSTRAND", "BRACKENFELL", "KUILS RIVER", "MITCHELLS PLAIN",
    "KHAYELITSHA", "ATHLONE", "MAITLAND", "SALT RIVER", "VREDEHOEK", "TAMBOERSKLOOF", "BANTRY BAY",
    "MOUILLE POINT", "MENLYN", "HATFIELD", "SOWETO", "FOURWAYS", "BRYANSTON", "BRAAMFONTEIN",
    "SUNNINGHILL", "EDENVALE", "GERMISTON", "BENONI", "BOKSBURG", "KEMPTON PARK", "ROODEPOORT",
    "KRUGERSDORP", "ROBERTSON", "WORCESTER", "MALMESBURY", "STRAND", "GORDONS BAY",
)
_PROVINCE_CODES = frozenset({"WC", "GP", "KZN", "EC", "FS", "NW", "LP", "MP", "NC"})
_MIN_TRUNCATED_LOCATION = 5  # letters, so "SEA PO" matches SEA POINT but "ST" matches nothing


@dataclass(frozen=True)
class ParsedDescriptor:
    merchant: str          # trading name only, upper case, no processor / location / account text
    processor: str | None  # e.g. "YOCO"
    location: str | None   # e.g. "CAPE TOWN"
    stripped: bool         # True when anything was removed from the raw text

    @property
    def display_name(self) -> str:
        # Title case, but keep initialisms (no vowels: DDC, CT, SMW, N1) as written.
        def style(word: str) -> str:
            letters = [ch for ch in word if ch.isalpha()]
            if not letters or (len(word) <= 4 and not any(ch in "AEIOUY" for ch in letters)) or "&" in word:
                return word
            return word.title()

        return " ".join(style(word) for word in self.merchant.split())


def _location_suffix_length(words: list[str]) -> int:
    """Number of trailing words that form a (possibly bank-truncated) known place."""
    if len(words) < 2:
        return 0
    for take in (3, 2, 1):
        if take >= len(words):
            continue
        tail = " ".join(words[-take:])
        compact = tail.replace(" ", "")
        if tail in _LOCATIONS:
            return take
        if len(compact) >= _MIN_TRUNCATED_LOCATION and any(
            place.replace(" ", "").startswith(compact) for place in _LOCATIONS
        ):
            return take
        if take == 1 and tail in _PROVINCE_CODES:
            return take
    return 0


def parse_descriptor(description: str | None) -> ParsedDescriptor:
    raw = _SPACE_RE.sub(" ", description or "").strip()
    text = _ACCOUNT_TAIL_RE.sub("", raw)
    processor: str | None = None
    match = _PROCESSOR_RE.match(text)
    if match:
        processor = match.group("processor").upper()
        text = match.group("rest")
    text = _BRANCH_RE.sub(" ", text)
    text = _SPACE_RE.sub(" ", text.replace("*", " ")).strip().upper()
    words = text.split(" ") if text else []

    location: str | None = None
    # Banks append a suburb and then a city ("SEA PO Cape Town"), so up to two places are
    # stripped, never leaving an empty name.
    for _ in range(2):
        take = _location_suffix_length(words)
        if not take:
            break
        place = " ".join(words[-take:])
        location = place if location is None else f"{place} {location}"
        words = words[:-take]
    merchant = " ".join(words).strip(" -/")
    if not merchant:
        return ParsedDescriptor(raw.upper(), None, None, False)
    return ParsedDescriptor(merchant, processor, location, merchant != raw.upper())
