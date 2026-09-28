import time

from fastapi import HTTPException

_hits: dict[str, list[float]] = {}
_MAX_KEYS = 20_000


def allow_request(key: str, max_requests: int, window_seconds: int, now: float | None = None) -> bool:
    current = time.monotonic() if now is None else now
    window_start = current - window_seconds
    stamps = [stamp for stamp in _hits.get(key, []) if stamp > window_start]
    if len(stamps) >= max_requests:
        _hits[key] = stamps
        return False
    stamps.append(current)
    _hits[key] = stamps
    if len(_hits) > _MAX_KEYS:
        stale = [entry for entry, times in _hits.items() if not times or times[-1] < window_start]
        for entry in stale[:1000]:
            _hits.pop(entry, None)
    return True


def enforce_rate_limit(key: str, max_requests: int, window_seconds: int) -> None:
    if not allow_request(key, max_requests, window_seconds):
        raise HTTPException(status_code=429, detail="Too many attempts. Wait a few minutes and try again.")
