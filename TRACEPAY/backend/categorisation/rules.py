"""Ordered deterministic rules. Category names are identifiers resolved in Supabase."""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Callable

from categorisation.normalize import normalize_description, normalize_for_matching


@dataclass(frozen=True)
class Rule:
    name: str
    category_name: str
    confidence: float
    matcher: Callable[[str, str], bool]
    transaction_class: str = "spending"


def contains(*phrases: str) -> Callable[[str, str], bool]:
    patterns = tuple(_bounded_phrase(phrase) for phrase in phrases)
    return lambda description, _transaction_type: any(
        pattern.search(description) for pattern in patterns
    )


def _bounded_phrase(phrase: str) -> re.Pattern[str]:
    return re.compile(rf"(?<![A-Z0-9]){re.escape(phrase)}(?![A-Z0-9])")


MerchantGroups = tuple[tuple[str, tuple[str, ...]], ...]

# Insurers and funeral/life cover providers commonly collected by debit order.
# Bank-owned products are matched by the generic words in INSURANCE_PHRASES.
INSURER_GROUPS: MerchantGroups = (
    ("Outsurance", ("OUTSURANCE",)),
    ("Dotsure", ("DOTSURE",)),
    ("Pineapple", ("PINEAPPLE",)),
    ("Santam", ("SANTAM",)),
    ("Sanlam", ("SANLAM",)),
    ("Old Mutual", ("OLD MUTUAL", "OLDMUTUAL")),
    ("Discovery Insure", ("DISCOVERY INSURE", "DISCOVERY INSURANCE", "DISCOVERY LIFE")),
    ("Momentum", ("MOMENTUM LIFE", "MOMENTUM INSURANCE", "MOMENTUM")),
    ("Liberty", ("LIBERTY LIFE", "LIBERTY GROUP", "LIBERTY INSURANCE")),
    ("Hollard", ("HOLLARD",)),
    ("Assupol", ("ASSUPOL",)),
    ("Clientele", ("CLIENTELE",)),
    ("Avbob", ("AVBOB",)),
    ("Brightrock", ("BRIGHTROCK",)),
    ("King Price", ("KING PRICE", "KINGPRICE")),
    ("Miway", ("MIWAY",)),
    ("First for Women", ("FIRST FOR WOMEN",)),
    ("1st for You", ("1ST FOR YOU",)),
    ("Auto & General", ("AUTO & GENERAL", "AUTO AND GENERAL")),
    ("Dialdirect", ("DIALDIRECT", "DIAL DIRECT")),
    ("Youi", ("YOUI",)),
    ("PPS", ("PPS INSURANCE", "PPS PREMIUM")),
    ("Metropolitan", ("METROPOLITAN LIFE", "METLIFE")),
)
# Matched with a non-credit direction only, so claim payouts stay out.
INSURANCE_PHRASES: tuple[str, ...] = (
    "INSURANCE",
    "ASSURANCE",
    "FUNERAL COVER",
    "FUNERAL PLAN",
    "FUNERAL POLICY",
    "LIFE COVER",
    "LIFE POLICY",
)

MEDICAL_AID_GROUPS: MerchantGroups = (
    ("Discovery Health", ("DISCOVERY HEALTH", "DISCOVERY VITALITY")),
    ("Momentum Health", ("MOMENTUM HEALTH",)),
    ("Bonitas", ("BONITAS",)),
    ("Fedhealth", ("FEDHEALTH",)),
    ("Bestmed", ("BESTMED",)),
    ("Medihelp", ("MEDIHELP",)),
    ("Medshield", ("MEDSHIELD",)),
    ("Profmed", ("PROFMED",)),
    ("Polmed", ("POLMED",)),
)
MEDICAL_AID_PHRASES: tuple[str, ...] = ("MEDICAL AID", "MEDICAL SCHEME")

# Gyms bill a membership every month, so they behave like subscriptions.
GYM_GROUPS: MerchantGroups = (
    ("Virgin Active", ("VIRGIN ACTIVE", "VIRGINACTIVE", "VIRGIN ACT NETCASH")),
    ("Planet Fitness", ("PLANET FITNESS",)),
    ("Anytime Fitness", ("ANYTIME FITNESS",)),
)
GYM_PHRASES: tuple[str, ...] = ("GYM MEMBERSHIP", "GYM FEES", "FITNESS CLUB", "HEALTH CLUB")

MORE_SUBSCRIPTION_GROUPS: MerchantGroups = (
    ("MultiChoice", ("MULTICHOICE",)),
    ("StarSat", ("STARSAT",)),
    ("iCloud", ("ICLOUD", "APPLE ICLOUD")),
    ("Dropbox", ("DROPBOX",)),
    ("Apple TV", ("APPLE TV",)),
    ("YouTube", ("YOUTUBE", "GOOGLE YOUTUBE")),
    ("Google Play", ("GOOGLE PLAY",)),
    ("Deezer", ("DEEZER",)),
    ("Tidal", ("TIDAL",)),
    ("Audible", ("AUDIBLE",)),
    ("Kindle Unlimited", ("KINDLE UNLIMITED",)),
    ("LinkedIn Premium", ("LINKEDIN PREMIUM",)),
    ("Duolingo", ("DUOLINGO",)),
    ("Headspace", ("HEADSPACE",)),
    ("GitHub", ("GITHUB",)),
    ("Notion", ("NOTION",)),
    ("Squarespace", ("SQUARESPACE",)),
    ("NordVPN", ("NORDVPN",)),
    ("ExpressVPN", ("EXPRESSVPN",)),
    ("Surfshark", ("SURFSHARK",)),
    ("Proton", ("PROTONVPN", "PROTONMAIL", "PROTON AG")),
    ("Midjourney", ("MIDJOURNEY",)),
    ("Claude", ("CLAUDE AI", "ANTHROPIC")),
    ("Perplexity", ("PERPLEXITY",)),
    ("Patreon", ("PATREON",)),
    ("Substack", ("SUBSTACK",)),
    ("Daily Maverick", ("DAILY MAVERICK",)),
    ("News24", ("NEWS24",)),
    ("PlayStation", ("PLAYSTATION", "PSN")),
    ("Xbox", ("XBOX",)),
    ("Nintendo", ("NINTENDO",)),
    ("Twitch", ("TWITCH",)),
    ("Paramount+", ("PARAMOUNT PLUS",)),
    ("HBO Max", ("HBO MAX", "HBO")),
)

# Betting and lottery operators. Matched on outflows only, so a payout stays out.
GAMBLING_GROUPS: MerchantGroups = (
    ("Hollywoodbets", ("HOLLYWOODBETS", "HOLLYWOOD BETS")),
    ("Betway", ("BETWAY",)),
    ("Supabets", ("SUPABETS",)),
    ("Sportingbet", ("SPORTINGBET", "SPORTING BET")),
    ("Sunbet", ("SUNBET", "SUN BET")),
    ("Yesplay", ("YESPLAY", "YES PLAY")),
    ("WSB", ("WSB", "WORLD SPORTS BETTING")),
    ("10bet", ("10BET",)),
    ("Lulabet", ("LULABET",)),
    ("Betwinner", ("BETWINNER",)),
    ("Playabets", ("PLAYABETS",)),
    ("Gbets", ("GBETS",)),
    ("Lottostar", ("LOTTOSTAR",)),
    ("National Lottery", ("NATIONAL LOTTERY", "POWERBALL", "PICK 3", "LOTTO")),
    ("Bet365", ("BET365",)),
    ("Casino", ("CASINO",)),
)

# Credit providers whose repayments leave the account on a schedule. Generic
# loan wording is left out: a home loan or vehicle finance is not this category.
CREDIT_GROUPS: MerchantGroups = (
    ("Payflex", ("PAYFLEX",)),
    ("Mobicred", ("MOBICRED",)),
    ("PayJustNow", ("PAYJUSTNOW", "PAY JUSTNOW")),
    ("Lewis Stores", ("LEWIS STORES",)),
    ("Bayport", ("BAYPORT",)),
    ("Finbond", ("FINBOND",)),
    ("Direct Axis", ("DIRECT AXIS",)),
    ("Moneyline", ("MONEYLINE",)),
    ("Jumo", ("JUMO",)),
    ("Cash Converters", ("CASH CONVERTERS",)),
    ("Wonga", ("WONGA",)),
    ("Fasta", ("FASTA",)),
    ("Bizmula", ("BIZMULA",)),
)

# Premium-rated and network-billed content. Never a bank fee.
PREMIUM_SMS_PHRASES: tuple[str, ...] = (
    "PREMIUM SMS",
    "SMS SUBSCRIPTION",
    "VAS SUBSCRIPTION",
    "MOBILE SUBSCRIPTION",
    "MOBILE CONTENT",
)

# Longer phrases are listed first so "MR D FOOD" wins over "MR D" and
# "UBER EATS" wins over "UBER". Labels are the canonical merchant keys'
# display form. Card-purchase recovery uses this list; it is not a new
# category catalogue.
_RECOGNISED_MERCHANT_GROUPS: MerchantGroups = (
    ("Mr D", ("MR D FOOD", "MRD FOOD", "MR D", "MRD")),
    ("Uber Eats", ("UBER EATS", "UBEREATS", "DLUBER EATS", "DLUBEREATS")),
    ("Pick n Pay", ("PICK N PAY", "PICKNPAY")),
    ("Woolworths", ("WOOLWORTHS",)),
    ("Checkers", ("CHECKERS",)),
    ("Shoprite", ("SHOPRITE",)),
    ("Spar Express", ("SPAR EXPRESS",)),
    ("Spar", ("SPAR",)),
    ("Food Lovers", ("FOOD LOVERS", "FOODLOVERS")),
    ("Nando's", ("NANDO'S", "NANDOS")),
    ("Mugg & Bean", ("MUGG & BEAN", "MUGG AND BEAN")),
    ("Debonairs", ("DEBONAIRS",)),
    ("Pizza Hut", ("PIZZA HUT",)),
    ("Ocean Basket", ("OCEAN BASKET",)),
    ("Kfc", ("KFC",)),
    ("Mcdonald's", ("MCDONALD'S", "MCDONALDS")),
    ("Steers", ("STEERS",)),
    ("Wimpy", ("WIMPY",)),
    ("Roman's Pizza", ("ROMAN'S PIZZA", "ROMANS")),
    ("Uber", ("UBER", "DLUBER")),
    ("Bolt", ("BOLT", "DLBOLT")),
    ("Shell", ("SHELL",)),
    ("Engen", ("ENGEN",)),
    ("Bp", ("BP",)),
    ("Totalenergies", ("TOTALENERGIES",)),
    ("Sasol", ("SASOL",)),
    ("Netflix", ("NETFLIX",)),
    ("Spotify", ("SPOTIFY", "SPOTIFYZA")),
    ("Dstv", ("DSTV",)),
    ("Showmax", ("SHOWMAX",)),
    ("CapCut", ("CAPCUT", "CAP CUT", "CAPCUT VIDEO", "GOOGLE CAPCUT")),
    ("Google One", ("GOOGLE ONE",)),
    ("OpenArt", ("OPENART", "OPEN ART", "OPENART AI")),
    (
        "ChatGPT",
        (
            "CHATGPT",
            "OPENAI CHATGPT",
            "OPENAI *CHATGPT",
            "OPENAI *CHATGPT SUBSCR",
            "AT EPOS AT OPENAI",
            "RECURRING PAYMENT FROM OPENAI",
        ),
    ),
    ("Cursor", ("AI POWERED IDE", "CURSOR AI", "CURSOR EDITOR", "CURSOR")),
    ("Adobe", ("ADOBE", "CREATIVE CLOUD")),
    ("Microsoft", ("MICROSOFT", "OFFICE 365", "M365")),
    ("Discord", ("DISCORD",)),
    ("Canva", ("CANVA",)),
    ("YouTube Premium", ("YOUTUBE PREMIUM", "YOUTUBE MUSIC")),
    ("Prime Video", ("PRIME VIDEO", "AMAZON PRIME")),
    ("Disney+", ("DISNEY PLUS", "DISNEY")),
    ("Apple Music", ("APPLE MUSIC",)),
    ("Apple", ("APPLE", "ITUNES", "APP STORE")),
    ("Mr Price", ("MR PRICE", "MRPRICE")),
    ("Wild Coast Go Karts", ("WILD COAST GO KARTS",)),
    ("MTN MoMo", ("MTN MOMO", "MTNMOMO")),
    ("MTN", ("MTN",)),
    ("Vodacom", ("VODACOM",)),
    ("Cell C", ("CELL C", "CELLC")),
    ("Telkom", ("TELKOM",)),
) + (
    INSURER_GROUPS
    + MEDICAL_AID_GROUPS
    + GYM_GROUPS
    + MORE_SUBSCRIPTION_GROUPS
    + GAMBLING_GROUPS
    + CREDIT_GROUPS
)

_RECOGNISED_MERCHANT_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = tuple(
    sorted(
        (
            (_bounded_phrase(phrase), label)
            for label, phrases in _RECOGNISED_MERCHANT_GROUPS
            for phrase in phrases
        ),
        key=lambda item: len(item[0].pattern),
        reverse=True,
    )
)


def recognised_merchant_label(normalized_text: str) -> str | None:
    """Return the canonical merchant label when an existing merchant phrase matches."""
    if not normalized_text:
        return None
    for pattern, label in _RECOGNISED_MERCHANT_PATTERNS:
        if pattern.search(normalized_text):
            return label
    return None


def incoming_contains(*phrases: str) -> Callable[[str, str], bool]:
    matcher = contains(*phrases)
    return lambda description, transaction_type: (
        transaction_type == "credit" and matcher(description, transaction_type)
    )


def contains_fragment(*fragments: str) -> Callable[[str, str], bool]:
    """Match known bank-compressed merchant fragments such as S2SAubsSpaza."""
    return lambda description, _transaction_type: any(
        fragment in description for fragment in fragments
    )


def any_of(*matchers: Callable[[str, str], bool]) -> Callable[[str, str], bool]:
    return lambda description, kind: any(matcher(description, kind) for matcher in matchers)


def _outflow(matcher: Callable[[str, str], bool]) -> Callable[[str, str], bool]:
    """Skip credits: refunds, claim payouts and similar are not charges."""
    return lambda description, kind: kind != "credit" and matcher(description, kind)


def _group_phrases(groups: MerchantGroups) -> tuple[str, ...]:
    return tuple(phrase for _label, phrases in groups for phrase in phrases)


_MOBILE_OPERATORS: tuple[str, ...] = ("MTN", "VODACOM", "CELL C", "TELKOM")

# Bank-specific wording for a debit-order collection.
DEBIT_ORDER_MARKERS: tuple[str, ...] = (
    "DEBIT ORDER",
    "ACB DEBIT",
    "NAEDO",
    "DEBICHECK",
    "MAGTAPE DEBIT",
)


_FEE_ROW = re.compile(r"^FEE(?![A-Z0-9])")


def _is_fee_row(description: str, _kind: str) -> bool:
    """GoTyme fee rows: ``Fee: ...``, ``Fee - ...``, failed-payment and replacement fees.

    The fee column carries the bank's charge, never the merchant payment, so
    the merchant named in the text must not turn the row into spending.
    """
    if _FEE_ROW.match(description.strip()):
        return True
    return "UNSUCCESSFUL" in description and "INSUFFICIENT FUNDS" in description or any(
        phrase in description for phrase in ("CARD REPLACEMENT FEE", "REPLACEMENT CARD FEE")
    )


_PURCHASE_REVERSAL = contains(
    "REFUND",
    "REVERSAL",
    "REVERSED",
    "CANCELLED",
    "CANCELED",
    "CORRECTION",
)
PURCHASE_REVERSAL_RULE = "description:purchase-reversal"


def is_purchase_reversal_description(description: str | None) -> bool:
    """True when the description says the entry undoes a payment.

    A credit alone is not enough: salary, interest, and other incoming payments
    stay on their own rules.
    """
    text = normalize_for_matching(description) or normalize_description(description)
    return _PURCHASE_REVERSAL(text, "")


RULES: tuple[Rule, ...] = (
    Rule(
        PURCHASE_REVERSAL_RULE,
        "",
        0.95,
        _PURCHASE_REVERSAL,
        transaction_class="unknown",
    ),
    Rule(
        "merchant:salary-advance",
        "Other Income",
        0.90,
        incoming_contains("SALARY ADVANCE"),
        transaction_class="income",
    ),
    Rule("description:fee-row", "Bank Fees", 0.97, _is_fee_row, transaction_class="bank_fee"),
    # Fees before merchant tokens so "Insufficient Funds Fee: Uber" stays a bank fee.
    Rule(
        "description:service-fee",
        "Bank Fees",
        0.95,
        contains(
            "SMS NOTIFICATION FEE",
            "NOTIFICATION FEE",
            "MONTHLY ACCOUNT ADMIN FEE",
            "ACCOUNT ADMIN FEE",
            "INSUFFICIENT FUNDS FEE",
            "INSUFFICIENT FUNDS CHARGE",
            "NSF FEE",
            "NSF CHARGE",
            "LIMIT EXCEEDED FEE",
            "SERVICE FEE",
            "BANK FEE",
            "MONTHLY FEE",
            "ACCOUNT FEE",
            "TRANSACTION FEE",
            "IMMEDIATE PAYMENT FEE",
            "BALANCE ENQUIRY FEE",
            "ATM FEE",
            "OVERDRAFT FEE",
            "OVERDRAFT CHARGE",
            "OVERDRAFT INTEREST",
            "INTEREST CHARGED",
            "DEBIT INTEREST",
            "BANK CHARGES",
            "BANK CHARGE",
            "SERVICE CHARGES",
            "SERVICE CHARGE",
            # Failed or returned debit orders. Wording differs by bank.
            "UNPAID ITEM FEE",
            "UNPAID ITEM CHARGE",
            "UNPAID DEBIT ORDER FEE",
            "UNPAID DEBIT ORDER CHARGE",
            "UNPAID DEBIT FEE",
            "UNPAID FEE",
            "RETURNED ITEM FEE",
            "RETURNED DEBIT FEE",
            "REJECTED DEBIT FEE",
            "REJECTED DEBIT ORDER FEE",
            "DISHONOURED ITEM FEE",
            "DISHONOURED DEBIT FEE",
            "DISHONOUR FEE",
            # Account upkeep.
            "ADMIN FEE",
            "ADMINISTRATION FEE",
            "MANAGEMENT FEE",
            "MAINTENANCE FEE",
            "ACCOUNT MAINTENANCE",
            "STATEMENT FEE",
            "DEBIT ORDER FEE",
            "INTERNET BANKING FEE",
            "ONLINE BANKING FEE",
            "CELLPHONE BANKING FEE",
            # Cards.
            "CARD FEE",
            "FASTER PAYMENT FEE",
            "PAY SHAP FEE",
            "ANNUAL FEE",
            "CREDIT CARD FEE",
            # Cash and ATM. These must beat the cash-withdrawal rule below.
            "ATM WITHDRAWAL FEE",
            "ATM CASH WITHDRAWAL FEE",
            "ATM CHARGE",
            "ATM BALANCE ENQUIRY",
            "ATM BALANCE INQUIRY",
            "BALANCE ENQUIRY",
            "BALANCE INQUIRY",
            "CASH WITHDRAWAL FEE",
            "CASH WITHDRAWAL CHARGE",
            "CASH ADVANCE FEE",
            "CASH DEPOSIT FEE",
            "CASH HANDLING FEE",
            "CASHBACK FEE",
            "CASH BACK FEE",
            # Alerts and electronic payments.
            "SMS ALERT FEE",
            "SMS FEE",
            "SMS CHARGE",
            "NOTIFYME FEE",
            "EFT FEE",
            "PAYSHAP FEE",
            "PAY SHAP FEE",
            "SEND MONEY FEE",
            "SENDMONEY FEE",
            "CASHSEND FEE",
            "VAS FEE",
            # Foreign and borrowing costs.
            "INTERNATIONAL TRANSACTION FEE",
            "CURRENCY CONVERSION FEE",
            "INTEREST ON OVERDRAFT",
            "CREDIT CARD INTEREST",
            "INTEREST ON CREDIT CARD",
            "INTEREST DEBIT",
        ),
        transaction_class="bank_fee",
    ),
    Rule("merchant:woolworths", "Groceries", 1.00, contains("WOOLWORTHS")),
    Rule("merchant:checkers", "Groceries", 1.00, contains("CHECKERS")),
    Rule("merchant:shoprite", "Groceries", 1.00, contains("SHOPRITE")),
    Rule("merchant:pick-n-pay", "Groceries", 1.00, contains("PICK N PAY", "PICKNPAY")),
    Rule("merchant:spar", "Groceries", 1.00, contains("SPAR")),
    Rule("merchant:foodlovers", "Groceries", 1.00, contains("FOODLOVERS", "FOOD LOVERS")),
    Rule("merchant:mr-price", "Shopping", 1.00, contains("MR PRICE", "MRPRICE")),
    Rule("merchant:wild-coast-go-karts", "Entertainment", 1.00, contains("WILD COAST GO KARTS")),
    Rule(
        "merchant:food-and-spaza",
        "Groceries",
        0.90,
        lambda description, kind: contains("TROPICAL FRUIT", "TROPICAL FOOD")(description, kind)
        or contains_fragment("SPAZA")(description, kind),
    ),
    Rule("merchant:nandos", "Restaurants", 1.00, contains("NANDO'S", "NANDOS")),
    Rule("merchant:mugg-and-bean", "Restaurants", 1.00, contains("MUGG & BEAN", "MUGG AND BEAN")),
    Rule("merchant:debonairs", "Restaurants", 1.00, contains("DEBONAIRS")),
    Rule("merchant:pizza-hut", "Restaurants", 1.00, contains("PIZZA HUT")),
    Rule("merchant:ocean-basket", "Restaurants", 1.00, contains("OCEAN BASKET")),
    Rule("merchant:kfc", "Fast Food", 1.00, contains("KFC")),
    Rule("merchant:mcdonalds", "Fast Food", 1.00, contains("MCDONALDS", "MCDONALD'S")),
    Rule("merchant:steers", "Fast Food", 1.00, contains("STEERS")),
    Rule("merchant:wimpy", "Fast Food", 1.00, contains("WIMPY")),
    Rule("merchant:romans", "Fast Food", 1.00, contains("ROMANS", "ROMAN'S PIZZA")),
    Rule(
        "merchant:food-delivery",
        "Fast Food",
        0.95,
        any_of(
            contains("UBER EATS", "MR D FOOD", "MRD FOOD", "MR D ", "MRD", "UBEREATS"),
            contains_fragment("DLUBER EATS", "DLUBEREATS"),
        ),
    ),
    Rule("merchant:uber", "Ride Hailing", 1.00, any_of(contains("UBER"), contains_fragment("DLUBER"))),
    Rule("merchant:bolt", "Ride Hailing", 1.00, any_of(contains("BOLT"), contains_fragment("DLBOLT"))),
    Rule("merchant:shell", "Fuel", 1.00, contains("SHELL")),
    Rule("merchant:engen", "Fuel", 1.00, contains("ENGEN")),
    Rule("merchant:bp", "Fuel", 1.00, contains("BP")),
    Rule("merchant:total", "Fuel", 1.00, contains("TOTALENERGIES")),
    Rule("merchant:sasol", "Fuel", 1.00, contains("SASOL")),
    Rule(
        "merchant:public-transport",
        "Public Transport",
        1.00,
        contains("INTERCAPE", "GREYHOUND", "MYCITI", "GAUTRAIN", "PRASA"),
    ),
    Rule(
        "merchant:airtime-data",
        "Airtime & Data",
        1.00,
        contains(
            "MTN AIRTIME",
            "MTN DATA",
            "MTN PREPAID",
            "PREPAID PURCHASE MTN",
            "PREPAID PURCHASE: MTN",
            "VODACOM AIRTIME",
            "VODACOM DATA",
            "VODACOM PREPAID",
            "PREPAID PURCHASE VODACOM",
            "TELKOM AIRTIME",
            "TELKOM DATA",
            "TELKOM MOBILE",
            "CELL C AIRTIME",
            "CELL C DATA",
            "CELL C PREPAID",
            "AIRTIME ADVANCE",
        ),
    ),
    Rule(
        "description:prepaid-airtime",
        "Airtime & Data",
        0.92,
        lambda description, _kind: (
            "PREPAID" in description
            and any(token in description for token in ("MTN", "VODACOM", "CELL C", "TELKOM"))
        ),
    ),
    Rule("merchant:chatgpt", "Subscriptions", 1.00, contains("CHATGPT", "OPENAI CHATGPT")),
    Rule(
        "merchant:subscriptions",
        "Subscriptions",
        1.00,
        any_of(
        contains(
            "NETFLIX",
            "SPOTIFY",
            "DSTV",
            "SHOWMAX",
            "APPLE.COM/BILL",
            "APPLE COM BILL",
            "GOOGLE *SERVICES",
            "GOOGLE ONE",
            "CAPCUT",
            "OPENART",
            "ADOBE",
            "CREATIVE CLOUD",
            "MICROSOFT",
            "OFFICE 365",
            "M365",
            "DISCORD",
            "CANVA",
            "YOUTUBE PREMIUM",
            "YOUTUBE MUSIC",
            "PRIME VIDEO",
            "AMAZON PRIME",
            "DISNEY PLUS",
            "APPLE MUSIC",
            "CURSOR AI",
            "CURSOR",
            "OPENAI *CHATGPT SUBSCR",
            "AT EPOS AT OPENAI",
            "RECURRING PAYMENT FROM OPENAI",
        ),
            contains_fragment("SPOTIFYZA"),
        ),
    ),
    # Health cover before insurers so "MOMENTUM HEALTH" is not read as life cover.
    Rule(
        "merchant:medical-aid",
        "Healthcare",
        0.92,
        _outflow(
            contains(
                *_group_phrases(MEDICAL_AID_GROUPS),
                *MEDICAL_AID_PHRASES,
            )
        ),
    ),
    Rule(
        "merchant:insurer",
        "Insurance",
        0.92,
        _outflow(contains(*_group_phrases(INSURER_GROUPS), *INSURANCE_PHRASES)),
    ),
    Rule(
        "merchant:gambling",
        "Gambling",
        0.92,
        _outflow(contains(*_group_phrases(GAMBLING_GROUPS))),
    ),
    Rule(
        "merchant:credit-provider",
        "Loans & Credit",
        0.90,
        _outflow(contains(*_group_phrases(CREDIT_GROUPS))),
    ),
    Rule(
        "merchant:gym",
        "Subscriptions",
        0.88,
        _outflow(contains(*_group_phrases(GYM_GROUPS), *GYM_PHRASES)),
    ),
    Rule(
        "merchant:subscriptions-extended",
        "Subscriptions",
        0.92,
        _outflow(contains(*_group_phrases(MORE_SUBSCRIPTION_GROUPS))),
    ),
    Rule(
        "description:premium-sms",
        "Subscriptions",
        0.88,
        _outflow(contains(*PREMIUM_SMS_PHRASES)),
    ),
    Rule(
        "description:mobile-network-billing",
        "Airtime & Data",
        0.90,
        lambda description, kind: kind != "credit"
        and "MOMO" not in description
        and any(
            _bounded_phrase(operator).search(description) for operator in _MOBILE_OPERATORS
        )
        and any(
            _bounded_phrase(phrase).search(description)
            for phrase in (
                "CONTRACT",
                "DEBIT ORDER",
                "MONTHLY BILL",
                "INVOICE",
                "BUNDLE",
                "TOP UP",
                "TOPUP",
                "RECHARGE",
                "VOUCHER",
                "AIRTIME",
                "OUT OF BUNDLE",
            )
        ),
    ),
    Rule(
        "description:airtime-wording",
        "Airtime & Data",
        0.90,
        _outflow(
            contains(
                "AIRTIME",
                "TALKTIME",
                "TALK TIME",
                "PREPAID DATA",
                "PREPAID VOUCHER",
                "PREPAID BUNDLE",
                "DATA TOP UP",
                "DATA TOPUP",
                "DATA VOUCHER",
                "DATA RECHARGE",
                "SMS BUNDLE",
                "VOICE BUNDLE",
                "OUT OF BUNDLE",
            )
        ),
    ),
    Rule("description:data-bundle", "Airtime & Data", 0.95, contains("DATA BUNDLE")),
    Rule(
        "description:vas-mobile-purchase",
        "Airtime & Data",
        0.92,
        any_of(contains("VAS PURCHASE", "VAS MOBILE PURCHASE", "MTN MOBILE")),
    ),
    Rule(
        "description:mobile-purchase-phone",
        "Airtime & Data",
        0.88,
        lambda description, _kind: (
            "MOBILE PURCHASE" in description
            and any(
                token in description
                for token in ("PHONE", "AIRTIME", "DATA", "MTN", "VODACOM", "CELL C", "TELKOM")
            )
            and recognised_merchant_label(description) is None
        ),
    ),
    Rule(
        "description:cash-withdrawal",
        "Cash Withdrawal",
        0.95,
        contains(
            "CASH WITHDRAWAL",
            "ATM WITHDRAWAL",
            "CASH OUT",
            "ATM CASH",
            "CASH AT ATM",
            "ATM W/D",
            "CASH ADVANCE",
            "CASHSEND",
            "CASH SEND",
        ),
    ),
    # Private-bank wording: money moved between the customer's own accounts.
    Rule(
        "description:own-account-move",
        "Transfers",
        0.90,
        lambda description, _kind: (
            description in {"SAVINGS", "CASH MANAGEMENT"}
            or description.startswith(("OWN ACCOUNT", "LINKED ACCOUNT", "CASH MANAGEMENT "))
        ),
        transaction_class="internal_transfer",
    ),
    # Faster Payments and rent go to other people, so they are not purchases.
    Rule(
        "description:faster-payment-to-person",
        "Transfers",
        0.88,
        lambda description, kind: (
            kind == "debit"
            and (
                "(FP)" in description
                or description in {"RENT"}
                or description.startswith("DEPOSIT LANDLORD")
            )
        ),
        transaction_class="person_to_person",
    ),
    # Absa wording: "DIGITAL TRANSF" moves money between the customer's own accounts;
    # "DIGITAL PAYMENT" pays another customer.
    Rule(
        "description:absa-digital-transfer",
        "Transfers",
        0.88,
        contains("DIGITAL TRANSF"),
        transaction_class="internal_transfer",
    ),
    Rule(
        "description:absa-digital-payment",
        "Transfers",
        0.88,
        lambda description, kind: kind != "credit" and "DIGITAL PAYMENT" in description,
        transaction_class="person_to_person",
    ),
    Rule(
        "description:banking-app-internal-transfer",
        "Transfers",
        0.90,
        lambda description, kind: (
            "BANKING APP" in description
            and "TRANSFER" in description
            and any(
                token in description
                for token in (
                    "MAIN ACCOUNT",
                    "PRIMARY ACCOUNT",
                    "OWN ACCOUNT",
                    "GOALSAVE",
                    "LIVE BETTER",
                    "SAVINGS ACCOUNT",
                    "TO SAVINGS",
                    "FROM SAVINGS",
                )
            )
        ),
        transaction_class="internal_transfer",
    ),
    Rule(
        "description:banking-app-savings-transfer",
        "Transfers",
        0.92,
        lambda description, _kind: (
            "BANKING APP" in description
            and "TRANSFER" in description
            and "SAVINGS" in description
        ),
        transaction_class="internal_transfer",
    ),
    Rule(
        "description:banking-app-transfer",
        "Transfers",
        0.88,
        lambda description, _kind: (
            "BANKING APP" in description
            and "TRANSFER" in description
            and "PAYSHAP" not in description
            and "PAYMENT" not in description
            and "SAVINGS" not in description
        ),
        transaction_class="person_to_person",
    ),
    Rule(
        "description:payment-to-beneficiary",
        "Transfers",
        0.90,
        lambda description, kind: (
            kind == "debit"
            and description.startswith("PAYMENT TO ")
            and any(token in description for token in ("MOBILE NO", "ACCOUNT NO"))
        ),
        transaction_class="person_to_person",
    ),
    Rule(
        "description:eft-outgoing",
        "Transfers",
        0.88,
        lambda description, kind: (
            kind == "debit"
            and "EFT" in description
            and "FEE" not in description
            and "PURCHASE" not in description
        ),
        transaction_class="person_to_person",
    ),
    Rule(
        "description:goalsave",
        "Transfers",
        0.95,
        contains("GOALSAVE"),
        transaction_class="internal_transfer",
    ),
    Rule(
        "description:live-better",
        "Transfers",
        0.93,
        contains("LIVE BETTER", "ROUND-UP TRANSFER", "ROUND UP TRANSFER", "INTEREST SWEEP"),
        transaction_class="internal_transfer",
    ),
    Rule(
        "description:savings-transfer",
        "Transfers",
        0.92,
        lambda description, _kind: "TRANSFER" in description
        and any(token in description for token in ("SAVINGS", "LIVE BETTER")),
        transaction_class="internal_transfer",
    ),
    Rule(
        "description:fixed-deposit",
        "Savings",
        0.95,
        contains("FIXED DEPOSIT"),
        transaction_class="savings",
    ),
    Rule(
        "description:money-transferred",
        "Transfers",
        0.92,
        lambda description, _kind: (
            "MONEY TRANSFERRED" in description
            and bool(
                description.replace("MONEY TRANSFERRED IN FOR", "")
                .replace("MONEY TRANSFERRED OUT FROM", "")
                .replace("MONEY TRANSFERRED IN", "")
                .replace("MONEY TRANSFERRED OUT", "")
                .strip(" -/")
            )
            and not any(
                token in description
                for token in (
                    "GOALSAVE",
                    "LIVE BETTER",
                    "ROUND-UP TRANSFER",
                    "ROUND UP TRANSFER",
                    "INTEREST SWEEP",
                    "FIXED DEPOSIT",
                )
            )
        ),
        transaction_class="person_to_person",
    ),
    Rule(
        "description:person-payment",
        "Transfers",
        0.92,
        contains(
            "SENDMONEY",
            "SEND MONEY",
            "PAY BENEFICIARY",
            "PAYSHAP",
            "PAY SHAP",
            "PAY BY SHAP",
            "PAY BY SHAPID",
            "IMMEDIATE PAYMENT",
            "EXTERNAL PAYSHAP",
            "EXTERNAL PAYMENT",
            "CASH SENT",
            "CAPITEC PAY",
        ),
        transaction_class="person_to_person",
    ),
    Rule(
        "description:payment-received",
        "Other Income",
        0.80,
        incoming_contains("PAYMENT RECEIVED"),
        transaction_class="income",
    ),
    Rule(
        "description:online-mtn",
        "Airtime & Data",
        0.90,
        contains("ONLINE PURCHASE: MTN", "ONLINE PURCHASE MTN"),
    ),
    Rule(
        "description:interest-received",
        "Other Income",
        0.90,
        incoming_contains("INTEREST RECEIVED", "INTEREST EARNED"),
        transaction_class="income",
    ),
    Rule(
        "description:electricity",
        "Utilities",
        0.90,
        contains("ELECTRICITY", "ESKOM", "PREPAID POWER"),
    ),
    Rule(
        "merchant:salary",
        "Salary",
        1.00,
        incoming_contains("SALARY", "PAYROLL", "WAGES", "MONTHLY SALARY"),
        transaction_class="income",
    ),
    # Last resort for collections nothing above could name. The class is known
    # (a recurring outflow someone is entitled to collect); the category is not.
    Rule(
        "description:debit-order",
        "Other",
        0.88,
        _outflow(contains(*DEBIT_ORDER_MARKERS)),
    ),
)
