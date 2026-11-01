"""Providers behind overlapping cover, gambling and high-cost credit findings.

Only the merchant key is read, never a description, and a provider is matched
only by a name it is known to bill under. A merchant that is not listed is
simply not part of these findings.
"""

from __future__ import annotations

import re

# --------------------------------------------------------------- funeral and life cover

# Providers whose recurring premium buys funeral or life cover. A short-term
# insurer ("DISCOVERY INSURE", "OUTSURANCE") is deliberately absent: two of
# those usually insure two different cars or homes.
_COVER_PROVIDERS: dict[str, tuple[str, ...]] = {
    "avbob": ("AVBOB",),
    "clientele": ("CLIENTELE",),
    "assupol": ("ASSUPOL",),
    "brightrock": ("BRIGHTROCK",),
    "metropolitan": ("METROPOLITAN LIFE", "METLIFE"),
    "liberty": ("LIBERTY LIFE",),
    "momentum": ("MOMENTUM LIFE",),
    "discovery_life": ("DISCOVERY LIFE",),
    "old_mutual": ("OLD MUTUAL", "OLDMUTUAL"),
    "sanlam": ("SANLAM",),
    "hollard_life": ("HOLLARD LIFE",),
}
_COVER_WORDING = ("FUNERAL", "LIFE COVER", "LIFE POLICY", "BURIAL")

# --------------------------------------------------------------- gambling

_GAMBLING_PROVIDERS: tuple[str, ...] = (
    "HOLLYWOODBETS",
    "HOLLYWOOD BETS",
    "BETWAY",
    "SUPABETS",
    "SPORTINGBET",
    "SPORTING BET",
    "SUNBET",
    "SUN BET",
    "YESPLAY",
    "YES PLAY",
    "WSB",
    "WORLD SPORTS BETTING",
    "10BET",
    "LULABET",
    "BETWINNER",
    "PLAYABETS",
    "GBETS",
    "LOTTOSTAR",
    "NATIONAL LOTTERY",
    "POWERBALL",
    "PICK 3",
    "LOTTO",
    "SUNSLOTS",
    "SUPERBET",
    "BET365",
    "1XBET",
    "CASINO",
)
# Matched as whole words only, so "LOTTO" never fires inside another word and a
# short name like "WSB" needs a word boundary on both sides.
_GAMBLING_PATTERN = re.compile(
    r"(?<![A-Z0-9])(?:" + "|".join(re.escape(name) for name in _GAMBLING_PROVIDERS) + r")(?![A-Z0-9])"
)

# --------------------------------------------------------------- credit

# Lenders whose loans are the costly kind. One of these repaid on a schedule is
# worth a look on its own.
_HIGH_COST_LENDERS: tuple[str, ...] = (
    "BAYPORT",
    "FINBOND",
    "DIRECT AXIS",
    "MONEYLINE",
    "JUMO",
    "CASH CONVERTERS",
    "PAYDAY LOAN",
    "CASH LOAN",
    "MICRO LOAN",
    "MICROLOAN",
    "SHORT TERM LOAN",
)
# Instalment and store credit. Costly mainly when several run at once.
_INSTALMENT_PROVIDERS: dict[str, tuple[str, ...]] = {
    "payflex": ("PAYFLEX",),
    "mobicred": ("MOBICRED",),
    "payjustnow": ("PAYJUSTNOW", "PAY JUSTNOW"),
    "lewis": ("LEWIS STORES",),
    "store_account": ("STORE ACCOUNT", "STORE CARD", "CREDIT ACCOUNT"),
    "personal_loan": ("PERSONAL LOAN", "LOAN REPAYMENT"),
}
_HIGH_COST_PATTERN = re.compile(
    r"(?<![A-Z0-9])(?:" + "|".join(re.escape(name) for name in _HIGH_COST_LENDERS) + r")(?![A-Z0-9])"
)


def _normal(merchant_name: str | None) -> str:
    return " ".join((merchant_name or "").upper().replace("-", " ").replace("_", " ").split())


def cover_provider(merchant_name: str | None) -> str | None:
    """Canonical provider id when the merchant bills funeral or life cover."""
    upper = _normal(merchant_name)
    if not upper:
        return None
    for provider_id, aliases in _COVER_PROVIDERS.items():
        if any(alias in upper for alias in aliases):
            return provider_id
    if any(word in upper for word in _COVER_WORDING):
        return upper
    return None


def is_gambling_merchant(merchant_name: str | None) -> bool:
    return bool(_GAMBLING_PATTERN.search(_normal(merchant_name)))


def credit_provider(merchant_name: str | None) -> tuple[str, bool] | None:
    """``(provider id, is_high_cost_lender)`` for a credit provider, else None."""
    upper = _normal(merchant_name)
    if not upper:
        return None
    if _HIGH_COST_PATTERN.search(upper):
        return upper, True
    for provider_id, aliases in _INSTALMENT_PROVIDERS.items():
        if any(alias in upper for alias in aliases):
            return provider_id, False
    return None
