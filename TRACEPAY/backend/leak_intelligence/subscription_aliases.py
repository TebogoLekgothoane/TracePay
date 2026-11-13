"""Merchant alias configuration for deterministic subscription detection.

Each alias maps a normalised merchant string to a canonical service. Entries
are checked in order and every token must appear in the normalised merchant
text, so more specific products (for example Cursor usage billing) are listed
before the general service entry.

``billing`` is a property of the product, not of a particular statement:
``usage`` products are metered and always reported as variable spend, even
when one usage charge happens to equal a subscription price.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class ServiceAlias:
    canonical_name: str
    merchant_key: str
    display_name: str
    tokens: tuple[str, ...]
    billing: Literal["subscription", "usage"] = "subscription"


SERVICE_ALIASES: tuple[ServiceAlias, ...] = (
    ServiceAlias("cursor_usage", "CURSOR", "Cursor usage", ("CURSOR", "USAGE"), "usage"),
    ServiceAlias("cursor", "CURSOR", "Cursor", ("CURSOR",)),
    ServiceAlias("cursor", "CURSOR", "Cursor", ("AI POWERED IDE",)),
    ServiceAlias("chatgpt", "CHATGPT", "ChatGPT", ("CHATGPT",)),
    ServiceAlias("chatgpt", "CHATGPT", "ChatGPT", ("OPENAI",)),
    ServiceAlias("apple", "APPLE", "Apple", ("APPLE.COM/BILL",)),
    ServiceAlias("apple", "APPLE", "Apple", ("ITUNES.COM",)),
    ServiceAlias("apple", "APPLE", "Apple", ("APPLE SERVICES",)),
    ServiceAlias("spotify", "SPOTIFY", "Spotify", ("SPOTIFY",)),
    ServiceAlias("netflix", "NETFLIX", "Netflix", ("NETFLIX",)),
    ServiceAlias("showmax", "SHOWMAX", "Showmax", ("SHOWMAX",)),
    ServiceAlias("dstv", "DSTV", "DStv", ("DSTV",)),
    ServiceAlias("youtube_premium", "YOUTUBE", "YouTube Premium", ("YOUTUBE",)),
    ServiceAlias("disney_plus", "DISNEY", "Disney+", ("DISNEY",)),
    ServiceAlias("amazon_prime", "AMAZON PRIME", "Amazon Prime", ("PRIME VIDEO",)),
    ServiceAlias("amazon_prime", "AMAZON PRIME", "Amazon Prime", ("AMAZON PRIME",)),
    ServiceAlias("microsoft", "MICROSOFT", "Microsoft", ("MICROSOFT",)),
    ServiceAlias("anthropic", "ANTHROPIC", "Claude", ("ANTHROPIC",)),
    ServiceAlias("github", "GITHUB", "GitHub", ("GITHUB",)),
)


def resolve_alias(merchant_text: str) -> ServiceAlias | None:
    text = merchant_text.upper()
    for alias in SERVICE_ALIASES:
        if all(token in text for token in alias.tokens):
            return alias
    return None
