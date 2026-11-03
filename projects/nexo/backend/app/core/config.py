from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field, HttpUrl, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="NEXO_",
        env_file=BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: Literal["development", "test", "production"] = "development"
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    supabase_url: HttpUrl | None = None
    database_url: SecretStr | None = None
    catalog_source: Literal["local", "supabase"] = "local"
    supabase_publishable_key: SecretStr | None = None
    # Backend-only key for app/catalog_writer.py. Never sent to the frontend or logged.
    supabase_secret_key: SecretStr | None = None
    tmdb_read_token: SecretStr | None = None
    igdb_client_id: str | None = None
    igdb_client_secret: SecretStr | None = None
    google_books_api_key: SecretStr | None = None
    # Vercel sends "Authorization: Bearer $CRON_SECRET" to cron routes; the name is Vercel's.
    cron_secret: SecretStr | None = Field(
        default=None, validation_alias=AliasChoices("CRON_SECRET", "NEXO_CRON_SECRET")
    )
    stats_retention_days: int = Field(default=90, ge=1, le=3650)

    @model_validator(mode="after")
    def validate_catalog_source(self) -> "Settings":
        if self.catalog_source == "supabase":
            if self.supabase_url is None or self.supabase_url.scheme != "https":
                raise ValueError("Supabase catalog requires an HTTPS project URL.")
            if self.supabase_publishable_key is None or not (
                self.supabase_publishable_key.get_secret_value().startswith("sb_publishable_")
            ):
                raise ValueError("Supabase catalog requires a publishable key, not an admin key.")
        return self

    @model_validator(mode="after")
    def validate_secret_key(self) -> "Settings":
        if self.supabase_secret_key is None:
            return self
        if not self.supabase_secret_key.get_secret_value().startswith("sb_secret_"):
            raise ValueError("The Supabase secret key must be an sb_secret_ key.")
        if self.supabase_url is None or self.supabase_url.scheme != "https":
            raise ValueError("The Supabase secret key requires an HTTPS project URL.")
        return self
