"""Streaming provider matching must not treat merchandise or studios as subscriptions."""

from __future__ import annotations

import pytest

from leak_intelligence.leak_engine import _classify_streaming_provider


@pytest.mark.parametrize(
    "merchant", ["DISNEY STORE", "DISNEYLAND PARIS", "HBO SHOP", "PARAMOUNT PICTURES", "PARAMOUNT HOTEL"]
)
def test_non_subscription_merchants_are_not_streaming(merchant) -> None:
    assert _classify_streaming_provider(merchant) is None


@pytest.mark.parametrize(
    ("merchant", "expected"),
    [
        ("DISNEY PLUS", "disney_plus"),
        ("DISNEY+", "disney_plus"),
        ("HBO MAX", "hbo_max"),
        ("PARAMOUNT+", "paramount_plus"),
        ("NETFLIX.COM", "netflix"),
    ],
)
def test_real_streaming_services_still_match(merchant, expected) -> None:
    assert _classify_streaming_provider(merchant) == ("video_streaming", expected)
