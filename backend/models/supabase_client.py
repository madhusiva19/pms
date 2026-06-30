import os
from supabase import create_client, Client
import requests as req
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL: str = os.getenv("SUPABASE_URL")
SUPABASE_KEY: str = os.getenv("SUPABASE_KEY")
SERVICE_KEY: str  = os.getenv("SUPABASE_SERVICE_KEY")

# ── Official Supabase client (primary) ────────────────────────────────────────
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Custom HTTP client (kept for branches that use it) ────────────────────────
class SupabaseClient:
    def __init__(self, url, key):
        self.url = url
        self.key = key
        self.headers = {
            "apikey":        key,
            "Authorization": f"Bearer {key}",
            "Content-Type":  "application/json",
            "Prefer":        "return=representation"
        }
    def table(self, table_name):
        return SupabaseTable(self.url, self.headers, table_name)

class SupabaseTable:
    def __init__(self, url, headers, table_name):
        self.url        = url
        self.headers    = dict(headers)
        self.table_name = table_name
        self.params     = {}
        self.method     = "GET"
        self.body       = None
        self._count     = None

    def select(self, columns="*", count=None):
        self.params["select"] = columns
        if count == "exact":
            self.headers = {**self.headers, "Prefer": "count=exact"}
            self._count  = True
        return self

    def insert(self, data):
        self.method = "POST"
        self.body   = data
        return self

    def update(self, data):
        self.method = "PATCH"
        self.body   = data
        return self

    def delete(self):
        self.method = "DELETE"
        return self

    def eq(self, col, val):
        self.params[col] = f"eq.{val}"
        return self

    def in_(self, col, vals):
        self.params[col] = "in.({})".format(",".join(str(v) for v in vals))
        return self

    def limit(self, n):
        self.params["limit"] = str(n)
        return self

    def order(self, col, desc=False):
        self.params["order"] = f"{col}.{'desc' if desc else 'asc'}"
        return self

    def execute(self):
        url = f"{self.url}/rest/v1/{self.table_name}"
        filter_params = {k: v for k, v in self.params.items() if k != "select"}
        all_params    = self.params

        if self.method == "GET":
            res = req.get(url, headers=self.headers, params=all_params)
        elif self.method == "POST":
            res = req.post(url, headers=self.headers, json=self.body)
        elif self.method == "PATCH":
            res = req.patch(url, headers=self.headers, params=filter_params, json=self.body)
        elif self.method == "DELETE":
            res = req.delete(url, headers=self.headers, params=filter_params)

        if not res.ok:
            raise Exception(f"Supabase error {res.status_code}: {res.text}")

        class Result:
            pass
        result = Result()
        try:
            result.data = res.json() if res.text else []
            if not isinstance(result.data, list):
                result.data = [result.data] if result.data else []
        except Exception:
            result.data = []

        if self._count:
            content_range = res.headers.get("Content-Range", "")
            try:
                result.count = int(content_range.split("/")[-1])
            except Exception:
                result.count = len(result.data)
        else:
            result.count = len(result.data)

        return result

# Legacy client — used by branches that import SupabaseClient directly
supabase_http = SupabaseClient(SUPABASE_URL, SUPABASE_KEY)

# ── Compatibility exports for Denusha's services (services/common.py) ─────────
import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request as _UrllibRequest, urlopen

USE_SUPABASE = bool(SUPABASE_URL and SUPABASE_KEY)

TABLE_ALIASES: dict = {
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
_TABLE_CACHE: dict = {}


def resolve_table_name(table: str) -> str:
    if table in _TABLE_CACHE:
        return _TABLE_CACHE[table]
    candidates = TABLE_ALIASES.get(table, [table])
    last_error = None
    for candidate in candidates:
        try:
            raw_supabase_request(candidate, params={"select": "id", "limit": 1})
            _TABLE_CACHE[table] = candidate
            return candidate
        except Exception as error:
            last_error = error
            if "PGRST205" not in str(error) and "Could not find the table" not in str(error):
                _TABLE_CACHE[table] = candidate
                return candidate
    raise last_error or RuntimeError(f"No Supabase table found for {table}")


def raw_supabase_request(table: str, method: str = "GET", params=None, payload=None):
    if not USE_SUPABASE:
        raise RuntimeError("Supabase credentials are not configured")
    query = f"?{urlencode(params, doseq=True)}" if params else ""
    url = f"{SUPABASE_URL}/rest/v1/{table}{query}"
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = _UrllibRequest(
        url, data=body, method=method,
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


def supabase_request(table: str, method: str = "GET", params=None, payload=None):
    return raw_supabase_request(resolve_table_name(table), method=method, params=params, payload=payload)
