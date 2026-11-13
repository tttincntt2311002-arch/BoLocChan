"""Validated configuration; paths are relative to backend."""

import os
from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from dotenv import load_dotenv
from pydantic import BaseModel, Field, model_validator

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseModel):
    APP_NAME: str = "SBT Certificate System API"
    APP_ENV: Literal["development", "test", "production"] = "development"
    DATABASE_URL: str = f"sqlite:///{(BACKEND_DIR / 'sbt_certificates.db').as_posix()}"
    SECRET_KEY: str = Field(min_length=32)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=60, ge=1, le=1440)
    CORS_ORIGINS: str = "http://localhost:5173"
    PUBLIC_FRONTEND_URL: str = "http://localhost:5173"
    WEB3_PROVIDER_URL: str = ""
    CHAIN_ID: int = Field(default=11155111, gt=0, le=2**63 - 1)
    SBT_CONTRACT_ADDRESS: str = ""
    MIN_CONFIRMATIONS: int = Field(default=2, ge=1)
    SBT_DEPLOYMENT_BLOCK: int = Field(default=0, ge=0)
    SYNC_INTERVAL_SECONDS: int = Field(default=15, ge=1)
    SYNC_ENABLED: bool = True
    SYNC_BLOCK_RANGE: int = Field(default=1000, ge=1, le=5000)
    PINATA_JWT: str = ""
    MAX_CSV_BYTES: int = Field(default=1_048_576, ge=1024)
    MAX_CSV_ROWS: int = Field(default=1000, ge=1, le=10000)

    @model_validator(mode="after")
    def validate_security(self):
        public = urlsplit(self.PUBLIC_FRONTEND_URL)
        if (
            public.scheme not in ("http", "https")
            or not public.netloc
            or public.username
            or public.password
            or public.query
            or public.fragment
            or public.path not in ("", "/")
        ):
            raise ValueError("PUBLIC_FRONTEND_URL must be an http(s) origin without credentials, path or query")
        self.PUBLIC_FRONTEND_URL = self.PUBLIC_FRONTEND_URL.rstrip("/")
        if not self.DATABASE_URL.startswith("sqlite:///"):
            raise ValueError("This application requires SQLite")
        if not self.cors_origins_list or any(
            o == "*" or not o.startswith(("http://", "https://")) for o in self.cors_origins_list
        ):
            raise ValueError("CORS_ORIGINS requires explicit http(s) frontend origins")
        if self.SECRET_KEY.startswith(("CHANGE_", "replace-")):
            raise ValueError("Generate a random SECRET_KEY of at least 32 characters")
        return self

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    load_dotenv(BACKEND_DIR / ".env", override=False)
    return Settings.model_validate({k: os.environ[k] for k in Settings.model_fields if k in os.environ})
