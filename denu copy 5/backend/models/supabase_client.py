"""Supabase data access helpers for the performance evaluation backend."""

import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BACKEND_DIR.parent


def load_env_file(path):
    """Load key=value pairs from a local environment file."""

    if not path.exists():
        return

    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env_file(BACKEND_DIR / ".env")
load_env_file(PROJECT_DIR / "frontend" / ".env.local")

# Prefer backend env names, but also support frontend public names because the
# Flask API and Next.js app are run from the same local project during dev.
SUPABASE_URL = (
    os.getenv("SUPABASE_URL")
    or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    or os.getenv("VITE_SUPABASE_URL")
    or ""
).rstrip("/")
SUPABASE_KEY = (
    os.getenv("SUPABASE_KEY")
    or os.getenv("SUPABASE_ANON_KEY")
    or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    or os.getenv("VITE_SUPABASE_ANON_KEY")
    or ""
)
USE_SUPABASE = bool(SUPABASE_URL and SUPABASE_KEY)

TABLE_ALIASES = {
    "users": ["users"],
    "team_members": ["team_members"],
    "performance_records": ["performance_records", "performance_record"],
    "performance_summary": ["performance_summaries", "performance_summary"],
    "evaluations": ["evaluations"],
    "evaluation_status": ["evaluation_status", "evaluation_ststus"],
    "evaluation_scores": ["evaluation_scores", "evaluation_score"],
    "rejection_comments": ["evaluation_rejection_comments", "evaluation_regection_commments", "rejection_comments"],
    "notifications": ["evaluation_notifications", "evaluation_notificartiion", "notifications"],
    "approvals": ["evaluation_approvals", "evalaution_apporovals", "approvals"],
    "evaluation_stages": ["evaluation_stages"],
}
TABLE_CACHE = {}


def resolve_table_name(table):
    """Find the real Supabase table name for a logical table key."""

    if not USE_SUPABASE:
        return table

    candidates = TABLE_ALIASES.get(table, [table])
    if table in TABLE_CACHE:
        return TABLE_CACHE[table]

    # Probe known spellings once and cache the winner. This keeps the service
    # layer stable even when a Supabase table was created with an older name.
    last_error = None
    for candidate in candidates:
        try:
            raw_supabase_request(candidate, params={"select": "id", "limit": 1})
            TABLE_CACHE[table] = candidate
            return candidate
        except Exception as error:
            last_error = error
            if "PGRST205" not in str(error) and "Could not find the table" not in str(error):
                TABLE_CACHE[table] = candidate
                return candidate

    raise last_error or RuntimeError(f"No Supabase table found for {table}")


def raw_supabase_request(table, method="GET", params=None, payload=None):
    """Send one low-level REST request to a concrete Supabase table."""

    if not USE_SUPABASE:
        raise RuntimeError("Supabase credentials are not configured")

    query = f"?{urlencode(params, doseq=True)}" if params else ""
    url = f"{SUPABASE_URL}/rest/v1/{table}{query}"
    body = json.dumps(payload).encode("utf-8") if payload is not None else None

    # Use Supabase's REST API directly to avoid requiring an additional Python
    # client dependency for this small backend.
    req = Request(
        url,
        data=body,
        method=method,
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Prefer": "return=representation",
        },
    )

    try:
        with urlopen(req, timeout=10) as response:
            content = response.read().decode("utf-8")
            return json.loads(content) if content else []
    except HTTPError as error:
        detail = error.read().decode("utf-8")
        raise RuntimeError(f"Supabase {error.code}: {detail}") from error
    except URLError as error:
        raise RuntimeError(f"Supabase connection failed: {error.reason}") from error


def supabase_request(table, method="GET", params=None, payload=None):
    """Resolve table aliases, then send a Supabase request."""

    return raw_supabase_request(resolve_table_name(table), method=method, params=params, payload=payload)


__all__ = [
    "SUPABASE_KEY",
    "SUPABASE_URL",
    "TABLE_ALIASES",
    "USE_SUPABASE",
    "raw_supabase_request",
    "resolve_table_name",
    "supabase_request",
]
