"""
Application configuration – reads from environment / .env file
"""
from __future__ import annotations

from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App ──────────────────────────────────────────────────────────────────
    APP_NAME: str = "SBT Certificate System API"
    APP_ENV: str = "development"
    APP_DEBUG: bool = True
    APP_PORT: int = 8000
    SECRET_KEY: str = "CHANGE_ME_IN_PRODUCTION"

    # ── CORS ─────────────────────────────────────────────────────────────────
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    # ── Database ─────────────────────────────────────────────────────────────
    DATABASE_URL: str = "sqlite:///./sbt_certificates.db"

    # ── Ethereum / Web3 ──────────────────────────────────────────────────────
    WEB3_PROVIDER_URL: str = "https://rpc.sepolia.org"
    CHAIN_ID: int = 11155111
    SBT_CONTRACT_ADDRESS: str = "0x0000000000000000000000000000000000000000"
    ADMIN_WALLET_ADDRESS: str = "0x0000000000000000000000000000000000000000"
    ADMIN_PRIVATE_KEY: str = ""

    # ── IPFS / Pinning ───────────────────────────────────────────────────────
    IPFS_PINNING_SERVICE: str = "pinata"
    PINATA_API_KEY: str = ""
    PINATA_SECRET_API_KEY: str = ""
    WEB3STORAGE_TOKEN: str = ""
    IPFS_GATEWAY: str = "https://ipfs.io/ipfs/"

    # ── JWT ──────────────────────────────────────────────────────────────────
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7


settings = Settings()
