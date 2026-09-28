import json
import logging
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.config import settings

logger = logging.getLogger("tracepay.categories")


def fetch_category_names(access_token: str) -> list[str]:
    """Read the live taxonomy; the AI never receives a code-defined category list."""
    project_url = settings.supabase_url.rstrip("/")
    publishable_key = settings.supabase_publishable_key()
    if not project_url or not publishable_key:
        logger.warning("[CATEGORISATION] category_catalog_unavailable reason=missing_supabase_config")
        return []
    request = Request(
        f"{project_url}/rest/v1/categories?select=name",
        headers={"apikey": publishable_key, "Authorization": f"Bearer {access_token}"},
        method="GET",
    )
    try:
        with urlopen(request, timeout=10) as response:
            rows = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, ValueError) as error:
        status = getattr(error, "code", None)
        logger.warning("[CATEGORISATION] category_catalog_unavailable error_type=%s status=%s", type(error).__name__, status)
        return []
    names = sorted({row["name"] for row in rows if isinstance(row, dict) and isinstance(row.get("name"), str) and row["name"].strip()})
    logger.info("[CATEGORISATION] category_catalog_loaded count=%s", len(names))
    return names
