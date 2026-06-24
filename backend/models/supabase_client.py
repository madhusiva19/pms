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
