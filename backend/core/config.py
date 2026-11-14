import json
import re
from typing import Any
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def normalize_database_url(raw_url: str) -> str:
    """Normalize database connection URLs for SQLAlchemy and serverless PostgreSQL.

    - Strips whitespace.
    - Rewrites legacy `postgres://` schemes to `postgresql://`.
    - Automatically appends `sslmode=require` for remote Neon hosts (*.neon.tech)
      if sslmode is not already configured.
    """
    cleaned = raw_url.strip()
    if not cleaned:
        return cleaned

    # Handle postgres:// scheme rewrite first
    if cleaned.startswith("postgres://"):
        cleaned = "postgresql://" + cleaned[len("postgres://") :]

    parsed = urlsplit(cleaned)
    hostname = (parsed.hostname or "").lower()
    is_neon_host = hostname.endswith(".neon.tech")

    if is_neon_host:
        qs = parse_qs(parsed.query, keep_blank_values=True)
        if "sslmode" not in qs:
            qs["sslmode"] = ["require"]
            flat_query = {k: v[0] if len(v) == 1 else v for k, v in qs.items()}
            new_query = urlencode(flat_query, doseq=True)
            return urlunsplit(
                (
                    parsed.scheme,
                    parsed.netloc,
                    parsed.path,
                    new_query,
                    parsed.fragment,
                )
            )

    return cleaned


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    DATABASE_URL: str = "sqlite:///./diffly.db"
    JWT_SECRET_KEY: str = "diffly-dev-secret-key-change-in-production-only"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days
    AUTH_COOKIE_NAME: str = "diffly_access_token"
    ENVIRONMENT: str = "development"
    NODE_ENV: str = "development"
    PORT: int = 8000
    COOKIE_SECURE: bool = False
    CORS_ORIGINS: list[str] | str = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]
    CORS_ORIGIN_REGEX: str = r"^https://.*\.vercel\.app$"
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_RECYCLE_SECONDS: int = 300
    DB_POOL_PRE_PING: bool = True
    VERCEL: str | None = None

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def validate_database_url(cls, v: Any) -> str:
        if isinstance(v, str):
            return normalize_database_url(v)
        return str(v)

    @field_validator("CORS_ORIGIN_REGEX")
    @classmethod
    def validate_cors_origin_regex(cls, v: str) -> str:
        cleaned = v.strip()
        if cleaned:
            re.compile(cleaned)
        return cleaned

    @property
    def is_cookie_secure(self) -> bool:
        if self.COOKIE_SECURE:
            return True
        return (
            self.ENVIRONMENT.lower() == "production"
            or self.NODE_ENV.lower() == "production"
        )

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            val = v.strip()
            if not val:
                return []
            if val.startswith("[") and val.endswith("]"):
                try:
                    parsed = json.loads(val)
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed]
                except Exception:
                    pass
            return [origin.strip() for origin in val.split(",") if origin.strip()]
        if isinstance(v, (list, tuple)):
            return [str(item).strip() for item in v]
        raise ValueError("Invalid format for CORS_ORIGINS")


settings = Settings()
