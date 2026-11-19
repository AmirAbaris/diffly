import contextlib
import ipaddress
import json
import re
from typing import Any
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


# Dev-only fallback; rejected at startup when production/secure-cookie mode is active.
DEFAULT_JWT_SECRET_KEY = "diffly-dev-secret-key-change-in-production-only"  # noqa: S105
MIN_JWT_SECRET_LENGTH = 32


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
    JWT_SECRET_KEY: str = DEFAULT_JWT_SECRET_KEY
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days
    AUTH_COOKIE_NAME: str = "diffly_access_token"
    GUEST_COOKIE_NAME: str = "diffly_guest_session"
    GUEST_SESSION_MAX_AGE_DAYS: int = 30
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
    CORS_ORIGIN_REGEX: str = (
        r"^https://diffly(?:-[a-z0-9]+)*-amirabaris\.vercel\.app$"
        r"|^https://diffly(?:-sigma)?\.vercel\.app$"
    )
    TRUSTED_PROXY_CIDRS: list[str] = []
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_RECYCLE_SECONDS: int = 300
    DB_POOL_PRE_PING: bool = True
    DB_CONNECT_TIMEOUT: int = 10
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
    def is_vercel(self) -> bool:
        return (self.VERCEL or "").strip().lower() in {"1", "true"}

    @property
    def is_cookie_secure(self) -> bool:
        if self.COOKIE_SECURE:
            return True
        return (
            self.ENVIRONMENT.lower() == "production"
            or self.NODE_ENV.lower() == "production"
        )

    def validate_runtime_security(self) -> None:
        """Fail fast when production/secure-cookie mode uses an unsafe JWT secret."""
        if not self.is_cookie_secure:
            return
        secret = self.JWT_SECRET_KEY.strip()
        if secret == DEFAULT_JWT_SECRET_KEY:
            raise RuntimeError(
                "Insecure JWT_SECRET_KEY: default development secret cannot be used "
                "when ENVIRONMENT=production, NODE_ENV=production, or "
                "COOKIE_SECURE=true."
            )
        if len(secret) < MIN_JWT_SECRET_LENGTH:
            raise RuntimeError(
                f"Insecure JWT_SECRET_KEY: secret must be at least "
                f"{MIN_JWT_SECRET_LENGTH} characters in production/secure-cookie mode."
            )

    @model_validator(mode="after")
    def _check_runtime_security(self) -> "Settings":
        self.validate_runtime_security()
        return self

    @staticmethod
    def _parse_str_list(v: Any, field_name: str) -> list[str]:
        if isinstance(v, str):
            val = v.strip()
            if not val:
                return []
            if val.startswith("[") and val.endswith("]"):
                with contextlib.suppress(json.JSONDecodeError, ValueError):
                    parsed = json.loads(val)
                    if isinstance(parsed, list):
                        return [
                            cleaned for item in parsed if (cleaned := str(item).strip())
                        ]
            return [item.strip() for item in val.split(",") if item.strip()]
        if isinstance(v, (list, tuple)):
            return [str(item).strip() for item in v if str(item).strip()]
        raise ValueError(f"Invalid format for {field_name}")

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Any) -> list[str]:
        return cls._parse_str_list(v, "CORS_ORIGINS")

    @field_validator("TRUSTED_PROXY_CIDRS", mode="before")
    @classmethod
    def assemble_trusted_proxy_cidrs(cls, v: Any) -> list[str]:
        cidrs = cls._parse_str_list(v, "TRUSTED_PROXY_CIDRS")
        for cidr in cidrs:
            ipaddress.ip_network(cidr, strict=False)
        return cidrs


settings = Settings()
