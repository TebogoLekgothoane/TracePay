"""Per-user leak result cache: reuse, single build, expiry and invalidation."""

from __future__ import annotations

import asyncio

from app.leak_detection_cache import UserResultCache


class Clock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


def _builder(calls: list[str], value: str = "result", delay: float = 0):
    async def build() -> str:
        calls.append(value)
        if delay:
            await asyncio.sleep(delay)
        return f"{value}-{len(calls)}"

    return build


def test_second_call_reuses_the_saved_result() -> None:
    async def run() -> None:
        cache: UserResultCache[str] = UserResultCache(ttl_seconds=60)
        calls: list[str] = []
        first, hit1 = await cache.get_or_build("u1", _builder(calls))
        second, hit2 = await cache.get_or_build("u1", _builder(calls))
        assert (first, hit1) == ("result-1", False)
        assert (second, hit2) == ("result-1", True)
        assert len(calls) == 1

    asyncio.run(run())


def test_users_do_not_share_results() -> None:
    async def run() -> None:
        cache: UserResultCache[str] = UserResultCache(ttl_seconds=60)
        calls: list[str] = []
        await cache.get_or_build("u1", _builder(calls, "a"))
        other, hit = await cache.get_or_build("u2", _builder(calls, "b"))
        assert hit is False
        assert other.startswith("b")

    asyncio.run(run())


def test_concurrent_callers_share_one_build() -> None:
    async def run() -> None:
        cache: UserResultCache[str] = UserResultCache(ttl_seconds=60)
        calls: list[str] = []
        results = await asyncio.gather(
            *[cache.get_or_build("u1", _builder(calls, delay=0.05)) for _ in range(4)]
        )
        assert len(calls) == 1
        assert {value for value, _ in results} == {"result-1"}

    asyncio.run(run())


def test_entry_expires() -> None:
    async def run() -> None:
        clock = Clock()
        cache: UserResultCache[str] = UserResultCache(ttl_seconds=60, clock=clock)
        calls: list[str] = []
        await cache.get_or_build("u1", _builder(calls))
        clock.now = 61
        _, hit = await cache.get_or_build("u1", _builder(calls))
        assert hit is False
        assert len(calls) == 2

    asyncio.run(run())


def test_invalidate_and_force_rebuild() -> None:
    async def run() -> None:
        cache: UserResultCache[str] = UserResultCache(ttl_seconds=60)
        calls: list[str] = []
        await cache.get_or_build("u1", _builder(calls))
        cache.invalidate("u1")
        _, hit = await cache.get_or_build("u1", _builder(calls))
        assert hit is False
        _, forced_hit = await cache.get_or_build("u1", _builder(calls), force=True)
        assert forced_hit is False
        assert len(calls) == 3

    asyncio.run(run())


def test_result_built_before_an_invalidation_is_not_saved() -> None:
    async def run() -> None:
        cache: UserResultCache[str] = UserResultCache(ttl_seconds=60)
        calls: list[str] = []

        async def build_then_data_changes() -> str:
            calls.append("old")
            cache.invalidate("u1")  # data changes while the analysis runs
            return "stale"

        value, _ = await cache.get_or_build("u1", build_then_data_changes)
        assert value == "stale"
        assert cache.peek("u1") is None

    asyncio.run(run())


def test_oldest_user_is_evicted_when_full() -> None:
    async def run() -> None:
        cache: UserResultCache[str] = UserResultCache(ttl_seconds=60, max_users=2)
        calls: list[str] = []
        for user in ("u1", "u2", "u3"):
            await cache.get_or_build(user, _builder(calls, user))
        assert cache.peek("u1") is None
        assert cache.peek("u3") is not None

    asyncio.run(run())
