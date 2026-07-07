from __future__ import annotations

import asyncio
from typing import Any

import httpx

DEFAULT_EXTERNAL_TIMEOUT_SECONDS = 10.0
DEFAULT_EXTERNAL_RETRIES = 3


async def request_json_with_retries(
    method: str,
    url: str,
    *,
    timeout: float = DEFAULT_EXTERNAL_TIMEOUT_SECONDS,
    retries: int = DEFAULT_EXTERNAL_RETRIES,
    retry_delay_seconds: float = 0.5,
    **kwargs: Any,
) -> dict[str, Any]:
    response = await request_with_retries(
        method,
        url,
        timeout=timeout,
        retries=retries,
        retry_delay_seconds=retry_delay_seconds,
        **kwargs,
    )
    return response.json()


async def request_with_retries(
    method: str,
    url: str,
    *,
    timeout: float = DEFAULT_EXTERNAL_TIMEOUT_SECONDS,
    retries: int = DEFAULT_EXTERNAL_RETRIES,
    retry_delay_seconds: float = 0.5,
    **kwargs: Any,
) -> httpx.Response:
    last_error: Exception | None = None

    for attempt in range(retries):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.request(method, url, **kwargs)
            response.raise_for_status()
            return response
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code < 500 and exc.response.status_code != 429:
                raise
            last_error = exc
        except (httpx.TimeoutException, httpx.RequestError) as exc:
            last_error = exc

        if attempt < retries - 1:
            await asyncio.sleep(retry_delay_seconds * (2**attempt))

    if last_error is not None:
        raise last_error
    raise RuntimeError("External request failed without an exception")
