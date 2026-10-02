import base64
import json

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "TRACEPAY API"
    supabase_url: str = ""
    supabase_key: str = ""
    supabase_anon_key: str = ""
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.6-flash"
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta"
    openai_api_key: str = ""
    openai_model: str = "gpt-4.1-mini"
    openai_base_url: str = "https://api.openai.com/v1"
    openai_timeout_seconds: int = 120
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"
    anthropic_base_url: str = "https://api.anthropic.com"
    anthropic_timeout_seconds: int = 45
    ai_categorisation_enabled: bool = False
    ai_extraction_enabled: bool = True
    ai_extraction_timeout_seconds: int = 180
    ai_extraction_max_pages: int = 20
    gemini_fallback_models: str = "gemini-3.8-flash,gemini-2.0-flash"

    def supabase_publishable_key(self) -> str:
        """Return the anon/publishable key only. A service-role value is treated as missing."""
        key = (self.supabase_anon_key or self.supabase_key).strip()
        if not key or _jwt_role(key) == "service_role":
            return ""
        return key


def _jwt_role(key: str) -> str | None:
    parts = key.split(".")
    if len(parts) != 3:
        return None
    payload = parts[1] + "=" * (-len(parts[1]) % 4)
    try:
        data = json.loads(base64.urlsafe_b64decode(payload.encode("ascii")))
    except (ValueError, json.JSONDecodeError):
        return None
    role = data.get("role")
    return role if isinstance(role, str) else None


settings = Settings()
