import pytest

from app.config import settings

from app.leak_detection import leak_detection_cache


@pytest.fixture(autouse=True)
def _empty_leak_detection_cache():
    """Tests reuse user ids, so a saved result must never carry over between them."""
    leak_detection_cache._entries.clear()
    leak_detection_cache._generation.clear()
    yield
    leak_detection_cache._entries.clear()
    leak_detection_cache._generation.clear()


@pytest.fixture(autouse=True)
def _no_live_merchant_directory(monkeypatch):
    """A developer's .env may enable the shared directory; tests must never reach a real database."""
    monkeypatch.setattr(settings, "merchant_directory_enabled", False)
