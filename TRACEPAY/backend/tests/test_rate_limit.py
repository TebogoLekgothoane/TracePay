from app.rate_limit import allow_request


def test_allow_request_blocks_after_max() -> None:
    assert allow_request("test-key-a", 2, 60, now=100.0) is True
    assert allow_request("test-key-a", 2, 60, now=101.0) is True
    assert allow_request("test-key-a", 2, 60, now=102.0) is False
    assert allow_request("test-key-a", 2, 60, now=161.0) is True
