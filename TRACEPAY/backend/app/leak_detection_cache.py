"""Short-lived per-user cache for the leak detection result.

Building the result reads the user's whole history and runs every detector, so
it is slow. The result only changes when the user's data does, so it is kept for
a few minutes and dropped at every point where the backend changes that data.
Changes made straight to the database by the app (an edited or deleted
transaction) are picked up when the entry expires or the user taps Refresh.
"""

from __future__ import annotations

import asyncio
import time
from collections import OrderedDict
from typing import Awaitable, Callable, Generic, TypeVar

T = TypeVar("T")

DEFAULT_TTL_SECONDS = 5 * 60
DEFAULT_MAX_USERS = 200


class UserResultCache(Generic[T]):
    def __init__(
        self,
        *,
        ttl_seconds: float = DEFAULT_TTL_SECONDS,
        max_users: int = DEFAULT_MAX_USERS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._ttl = ttl_seconds
        self._max_users = max_users
        self._clock = clock
        self._entries: OrderedDict[str, tuple[float, T]] = OrderedDict()
        self._locks: dict[str, asyncio.Lock] = {}
        self._generation: dict[str, int] = {}

    def _fresh(self, user_id: str) -> T | None:
        entry = self._entries.get(user_id)
        if entry is None:
            return None
        expires_at, value = entry
        if self._clock() >= expires_at:
            del self._entries[user_id]
            return None
        self._entries.move_to_end(user_id)
        return value

    def peek(self, user_id: str) -> T | None:
        return self._fresh(user_id)

    def invalidate(self, user_id: str) -> None:
        """Forget this user's result, including one that is still being built."""
        self._entries.pop(user_id, None)
        self._generation[user_id] = self._generation.get(user_id, 0) + 1

    async def get_or_build(
        self,
        user_id: str,
        build: Callable[[], Awaitable[T]],
        *,
        force: bool = False,
    ) -> tuple[T, bool]:
        """Return (result, from_cache). Concurrent callers share one build."""
        if not force:
            hit = self._fresh(user_id)
            if hit is not None:
                return hit, True

        lock = self._locks.setdefault(user_id, asyncio.Lock())
        async with lock:
            # Another caller may have finished while this one waited.
            if not force:
                hit = self._fresh(user_id)
                if hit is not None:
                    return hit, True
            started_generation = self._generation.get(user_id, 0)
            value = await build()
            # Skip storing a result the data changed underneath while it was built.
            if self._generation.get(user_id, 0) == started_generation:
                self._entries[user_id] = (self._clock() + self._ttl, value)
                self._entries.move_to_end(user_id)
                while len(self._entries) > self._max_users:
                    evicted, _ = self._entries.popitem(last=False)
                    self._generation.pop(evicted, None)
                    self._locks.pop(evicted, None)
            return value, False
