import base64
import json

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_PDF_EXTRACTION_TRUE = {"1", "true", "yes", "on"}


def _explicit_pdf_extraction_opt_in(value: object) -> bool:
    """Enable AI PDF extraction only for an explicit true. Anything else stays off."""
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value == 1
    if value is None:
        return False
    return str(value).strip().lower() in _PDF_EXTRACTION_TRUE


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

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
    # Real Grok keys come from console.x.ai. GROK_API_KEY is accepted as an alias.
    xai_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("XAI_API_KEY", "GROK_API_KEY"),
    )
    xai_model: str = "grok-4-1-fast-non-reasoning"
    xai_base_url: str = "https://api.x.ai/v1"
    xai_timeout_seconds: int = 120
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"
    anthropic_base_url: str = "https://api.anthropic.com"
    anthropic_timeout_seconds: int = 45
    ai_categorisation_enabled: bool = False
    ai_merchant_identification_min_confidence: float = Field(default=0.85, ge=0, le=1)
    ai_pdf_extraction_enabled: bool = False
    ai_extraction_timeout_seconds: int = 180
    ai_extraction_max_pages: int = 20
    gemini_fallback_models: str = "gemini-3.8-flash,gemini-2.5-flash"
    openrouter_api_key: str = ""
    openrouter_model: str = "openai/gpt-4o-mini"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_timeout_seconds: int = 60
    openrouter_http_referer: str = ""
    openrouter_title: str = "TracePay"
    # Optional LLM labels for subscription detection (OpenRouter). Off by default;
    # the model must be pinned explicitly or the feature stays off.
    subscription_llm_enabled: bool = False
    subscription_llm_model: str = ""
    subscription_llm_timeout_seconds: int = 10
    tracepay_env: str = "production"
    # Billing. Prices are in cents (ZAR) and are the single source of truth; the app
    # reads them from /billing/products. PAYSTACK_PLAN_CODE is the annual plan created
    # in the Paystack dashboard at the same price.
    supabase_service_role_key: str = ""
    paystack_secret_key: str = ""
    paystack_base_url: str = "https://api.paystack.co"
    paystack_plan_code: str = ""
    paystack_callback_url: str = "tracepay://billing/return"
    full_analysis_price_cents: int = 3900
    monitoring_price_cents: int = 19900
    # Billing. Prices are in cents (ZAR) and are the single source of truth; the app
    # reads them from /billing/products. PAYSTACK_PLAN_CODE is the annual plan created
    # in the Paystack dashboard at the same price.
    supabase_service_role_key: str = ""
    paystack_secret_key: str = ""
    paystack_base_url: str = "https://api.paystack.co"
    paystack_plan_code: str = ""
    paystack_callback_url: str = "tracepay://billing/return"
    full_analysis_price_cents: int = 3900
    monitoring_price_cents: int = 19900
    synthetic_intelligence_debug: bool = False

    @field_validator("ai_pdf_extraction_enabled", mode="before")
    @classmethod
    def _parse_ai_pdf_extraction_enabled(cls, value: object) -> bool:
        return _explicit_pdf_extraction_opt_in(value)

    @field_validator("synthetic_intelligence_debug", mode="before")
    @classmethod
    def _parse_synthetic_intelligence_debug(cls, value: object) -> bool:
        return _explicit_pdf_extraction_opt_in(value)

    @field_validator("tracepay_env", mode="before")
    @classmethod
    def _parse_tracepay_env(cls, value: object) -> str:
        if not isinstance(value, str) or not value.strip():
            return "production"
        return value.strip().lower()

    @field_validator("xai_api_key", mode="after")
    @classmethod
    def _reject_google_ai_studio_keys_as_xai(cls, value: str) -> str:
        """Google AI Studio keys belong in GEMINI_API_KEY, not XAI/GROK."""
        cleaned = (value or "").strip()
        if cleaned.startswith("AQ."):
            return ""
        return cleaned

    def categorisation_provider_keys(self) -> tuple[bool, bool, bool]:
        """Return (openrouter, openai, xai) key presence for categorisation."""
        return (
            bool(self.openrouter_api_key.strip()),
            bool(self.openai_api_key.strip()),
            bool(self.xai_api_key.strip()),
        )

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
