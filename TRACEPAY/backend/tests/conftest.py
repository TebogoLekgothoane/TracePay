import pytest

from app.leak_detection import leak_detection_cache


@pytest.fixture(autouse=True)
def _empty_leak_detection_cache():
    """Tests reuse user ids, so a saved result must never carry over between them."""
    leak_detection_cache._entries.clear()
    leak_detection_cache._generation.clear()
    yield
    leak_detection_cache._entries.clear()
    leak_detection_cache._generation.clear()
