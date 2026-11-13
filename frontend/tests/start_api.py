"""Isolated backend for browser tests; never touches the developer's database."""
import os
import secrets
import sys
import tempfile
from pathlib import Path

backend = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(backend))

with tempfile.TemporaryDirectory(prefix="sbt-auth-browser-") as directory:
    os.environ.update({
        "APP_ENV": "test",
        "SECRET_KEY": secrets.token_urlsafe(48),
        "DATABASE_URL": "sqlite:///" + (Path(directory) / "browser.db").as_posix(),
        "CORS_ORIGINS": "http://127.0.0.1:5178",
        "PUBLIC_FRONTEND_URL": "http://127.0.0.1:5178",
        "WEB3_PROVIDER_URL": "http://127.0.0.1:18545",
        "SBT_CONTRACT_ADDRESS": "0x5fbdb2315678afecb367f032d93f642f64180aa3",
        "CHAIN_ID": "31337",
        "MIN_CONFIRMATIONS": "1",
        "SYNC_ENABLED": "false",
        "PINATA_JWT": "",
    })
    from app.db.migrate import upgrade
    from seed import seed

    upgrade()
    seed()
    import uvicorn

    uvicorn.run("main:app", host="127.0.0.1", port=8011, log_level="warning")
