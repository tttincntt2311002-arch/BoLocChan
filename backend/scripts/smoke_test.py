"""Run real HTTP checks against Uvicorn on an isolated, disposable database.

Usage from backend: python scripts/smoke_test.py
"""

import json
import os
import secrets
import socket
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
PASSWORD = "DemoSBT2026!"


def main():
    with tempfile.TemporaryDirectory(prefix="sbt-http-smoke-") as directory:
        env = dict(os.environ)
        env.update(
            {
                "SECRET_KEY": secrets.token_urlsafe(48),
                "APP_ENV": "test",
                "DATABASE_URL": "sqlite:///" + (Path(directory) / "smoke.db").as_posix(),
                "CORS_ORIGINS": "http://localhost:5173",
                "WEB3_PROVIDER_URL": "",
                "SBT_CONTRACT_ADDRESS": "",
                "PINATA_JWT": "",
            }
        )
        subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=ROOT, env=env, check=True)
        subprocess.run([sys.executable, "seed.py"], cwd=ROOT, env=env, check=True, capture_output=True)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        log_path = Path(directory) / "uvicorn.log"
        with log_path.open("w+", encoding="utf-8") as log:
            process = subprocess.Popen(
                [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", str(port)],
                cwd=ROOT,
                env=env,
                stdout=log,
                stderr=log,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            )
            checks = []
            try:
                with httpx.Client(base_url=f"http://127.0.0.1:{port}", timeout=5, trust_env=False) as client:
                    for _ in range(100):
                        if process.poll() is not None:
                            log.seek(0)
                            raise RuntimeError("Uvicorn exited: " + log.read())
                        try:
                            if client.get("/health").status_code == 200:
                                break
                        except httpx.TransportError:
                            pass
                        time.sleep(0.1)
                    else:
                        raise RuntimeError("Uvicorn did not become healthy")

                    def check(method, path, expected, **kwargs):
                        response = client.request(method, path, **kwargs)
                        if response.status_code != expected:
                            raise AssertionError(f"{method} {path}: {response.status_code}, {response.text}")
                        checks.append({"method": method, "path": path, "status": response.status_code})
                        if response.headers.get("content-type", "").startswith("application/json"):
                            return response.json()
                        return response.text

                    check("GET", "/health", 200)
                    check("GET", "/docs", 200)
                    check("GET", "/openapi.json", 200)
                    check("GET", "/api/v1/users", 401)
                    tokens = {}
                    for actor in ["admin", "organizer", "participant"]:
                        result = check(
                            "POST",
                            "/api/v1/auth/login",
                            200,
                            json={"email": f"{actor}@example.com", "password": PASSWORD},
                        )
                        tokens[actor] = {"Authorization": "Bearer " + result["access_token"]}
                    user = check("GET", "/api/v1/users/me", 200, headers=tokens["participant"])
                    check("PATCH", "/api/v1/users/me", 422, headers=tokens["participant"], json={"role": "admin"})
                    check("GET", "/api/v1/users", 403, headers=tokens["participant"])
                    org = check("GET", "/api/v1/organizations", 200, headers=tokens["organizer"])["items"][0]
                    start = datetime.now(timezone.utc) + timedelta(days=1)
                    event = check(
                        "POST",
                        "/api/v1/events",
                        201,
                        headers=tokens["organizer"],
                        json={
                            "organization_id": org["id"],
                            "name": "Live HTTP Test Workshop",
                            "status": "active",
                            "start_date": start.isoformat(),
                            "end_date": (start + timedelta(hours=2)).isoformat(),
                        },
                    )
                    root = "/api/v1/events/" + event["id"]
                    participant = check("POST", root + "/register", 201, headers=tokens["participant"])
                    check("POST", root + "/register", 409, headers=tokens["participant"])
                    check(
                        "PATCH",
                        root + "/participants/" + participant["id"],
                        200,
                        headers=tokens["organizer"],
                        json={"status": "attended"},
                    )
                    payload = {
                        "event_id": event["id"],
                        "recipient_id": user["id"],
                        "token_uri": "ipfs://bafysmoke/metadata.json",
                    }
                    cert = check("POST", "/api/v1/certificates/issue", 202, headers=tokens["organizer"], json=payload)
                    check("POST", "/api/v1/certificates/issue", 409, headers=tokens["organizer"], json=payload)
                    verified = check("GET", "/api/v1/verify/certificate/" + cert["id"], 200)
                    assert not verified["is_valid"] and "recipient_id" not in verified["certificate"]
                    check(
                        "POST",
                        "/api/v1/certificates/" + cert["id"] + "/confirm",
                        503,
                        headers=tokens["organizer"],
                        json={"token_id": "0", "tx_hash": "0x" + "b" * 64},
                    )
                    check("GET", "/api/v1/audit-logs", 200, headers=tokens["admin"])
                    check("POST", "/api/v1/auth/logout", 204, headers=tokens["participant"])
                    check("GET", "/api/v1/auth/me", 401, headers=tokens["participant"])
                print(json.dumps({"result": "passed", "transport": "real HTTP", "checks": checks}, indent=2))
            finally:
                if os.name == "nt":
                    # The venv launcher can own a child Python process on Windows.
                    # Stopping only the launcher leaves SQLite open in that child.
                    subprocess.run(
                        ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        check=False,
                    )
                else:
                    process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)


if __name__ == "__main__":
    main()
