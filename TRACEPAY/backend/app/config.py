from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "TRACEPAY API"
    supabase_url: str = ""
    supabase_key: str = ""


settings = Settings()
