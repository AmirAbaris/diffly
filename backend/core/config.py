import json
from typing import Any

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


DEFAULT_JWT_SECRET_KEY = "diffly-dev-secret-key-change-in-production-only"
MIN_JWT_SECRET_LENGTH = 32


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
