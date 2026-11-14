"""Scan tracked working-tree files without printing credential values.

This is a lightweight repository check, not a scan of Git history or a secret
manager. Test fixtures may intentionally contain clearly labelled dummy keys.
"""

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PATTERNS = (
    re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(rb"(?i)(?:DEPLOYER_PRIVATE_KEY|PRIVATE_KEY)\s*[:=]\s*[\"']?(?:0x)?[0-9a-f]{64}(?![0-9a-f])"),
    re.compile(rb"(?i)(?:PINATA_JWT|API_TOKEN|ACCESS_TOKEN)\s*[:=]\s*[\"']?eyJ[\w-]+\.[\w-]+\.[\w-]+"),
)


def main():
    tracked = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).split(b"\0")
    findings = []
    for raw in filter(None, tracked):
        relative = raw.decode("utf-8")
        path = ROOT / relative
        if not path.is_file():
            continue
        # Public, deterministic fixtures are not deployment credentials.
        if relative.startswith(("blockchain/test/", "backend/tests/", "frontend/tests/")):
            continue
        for number, line in enumerate(path.read_bytes().splitlines(), 1):
            if any(pattern.search(line) for pattern in PATTERNS):
                findings.append(f"{relative}:{number}: possible credential (value redacted)")
    if findings:
        print("\n".join(findings))
        return 1
    print("PASS: no private-key material or assigned service JWT matched in tracked non-test files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
