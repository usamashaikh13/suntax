#!/usr/bin/env python3
"""
SunTax Secret Scanner (Pre-commit / CI Guard).
Ensures no credentials, database URLs, private keys, or API tokens are committed into version control.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

# Patterns identifying sensitive credentials
SECRET_PATTERNS = [
    (r"(?i)(password|passwd|pwd)\s*[:=]\s*['\"](?!\$)[^'\"\$\{\}]{6,}['\"]", "Hardcoded password"),
    (r"postgresql(?:\+asyncpg)?:\/\/[a-zA-Z0-9_-]+:[^@\s]+@", "PostgreSQL connection string with password"),
    (r"mysql(?:\+aiomysql)?:\/\/[a-zA-Z0-9_-]+:[^@\s]+@", "MySQL connection string with password"),
    (r"rnd_[a-zA-Z0-9]{20,}", "Render API Token"),
    (r"re_[a-zA-Z0-9]{20,}", "Resend API Key"),
    (r"AIza[0-9A-Za-z-_]{35}", "Google API Key"),
    (r"-----BEGIN (?:RSA |EC )?PRIVATE KEY-----", "Private cryptographic key"),
    (r"(?i)SECRET_KEY\s*=\s*['\"][0-9a-fA-F]{32,}['\"]", "Hardcoded production secret key"),
]

# Paths allowed to contain test mocks or placeholders
ALLOWED_PATHS = {
    ".env.example",
    "backend/.env.example",
    "frontend/.env.example",
}


REPO_ROOT = Path(__file__).resolve().parent.parent

def get_staged_files() -> list[str]:
    try:
        out = subprocess.check_output(
            ["git", "diff", "--cached", "--name-only", "--diff-filter=ACM"],
            text=True,
            cwd=REPO_ROOT,
        )
        return [f.strip() for f in out.splitlines() if f.strip()]
    except Exception:
        return []


def scan_file(filepath: str) -> list[str]:
    violations = []
    p = Path(filepath)
    if not p.exists() or p.is_dir():
        return []
    if filepath in ALLOWED_PATHS:
        return []

    try:
        content = p.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return []

    for pattern, desc in SECRET_PATTERNS:
        matches = re.finditer(pattern, content)
        for m in matches:
            line_no = content[: m.start()].count("\n") + 1
            line = content.splitlines()[line_no - 1].strip()

            # 1. Environment variable expansion is safe
            if "${" in line or "$(" in line or "os.environ" in line or "process.env" in line:
                continue

            lower_line = line.lower()

            # 2. Connection strings: allow only localhost / mock test DBs
            if "connection string" in desc.lower():
                if any(lh in lower_line for lh in ("localhost", "127.0.0.1", "test_db", "@dpg-mock")):
                    continue
                # Remote or unverified host is a strict violation
                violations.append(f"{filepath}:{line_no} - {desc} (External host detected)")
                continue

            # 3. Hardcoded passwords: allow only synthetic test tokens
            if desc == "Hardcoded password":
                # If explicitly marked as test, demo, mock, placeholder, sample
                if any(tok in lower_line for tok in ("test", "mock", "dummy", "sample", "placeholder", "changeme", "todo")):
                    continue

            # 4. Critical secrets (API keys, private keys, secret keys): NEVER allowed anywhere
            violations.append(f"{filepath}:{line_no} - {desc}")

    return violations


def main():
    staged = get_staged_files()
    if not staged:
        # If no staged files passed, scan working directory git-tracked files
        try:
            out = subprocess.check_output(["git", "ls-files"], text=True, cwd=REPO_ROOT)
            staged = [f.strip() for f in out.splitlines() if f.strip()]
        except Exception:
            pass

    all_violations = []
    for f in staged:
        v = scan_file(f)
        if v:
            all_violations.extend(v)

    if all_violations:
        print("❌ SECURITY ALERT: Secret scanner found potential credentials staged for commit:")
        for v in all_violations:
            print(f"   - {v}")
        print("\nPlease remove the secret before committing. Use environment variables instead.")
        sys.exit(1)

    print("✅ Secret scanner passed: No secrets or credentials found in tracked files.")
    sys.exit(0)


if __name__ == "__main__":
    main()
