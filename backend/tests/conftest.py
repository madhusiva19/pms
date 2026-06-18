"""
tests/conftest.py
------------------
Patches Supabase and APScheduler BEFORE any module imports them.
"""

import sys, os
from unittest.mock import MagicMock

# ── 1. Stub supabase package ─────────────────────────────────────
_mock_pkg    = MagicMock()
_mock_client = MagicMock()
_mock_pkg.create_client.return_value = _mock_client

sys.modules["supabase"]        = _mock_pkg
sys.modules["supabase.client"] = _mock_pkg
sys.modules["supabase.lib"]    = _mock_pkg

# ── 2. Stub APScheduler ──────────────────────────────────────────
_aps = MagicMock()
sys.modules["apscheduler"]                       = _aps
sys.modules["apscheduler.schedulers"]            = _aps
sys.modules["apscheduler.schedulers.background"] = _aps
sys.modules["apscheduler.triggers"]              = _aps
sys.modules["apscheduler.triggers.cron"]         = _aps

# ── 3. Dummy env vars ────────────────────────────────────────────
os.environ.setdefault("SUPABASE_URL", "https://mock.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "mock-key")

# ── 4. Import utils.db now so create_client() runs against mock ──
import utils.db as _db
_db.supabase = _mock_client

# ── 5. Patch supabase into every route/service module namespace ──
import importlib, pkgutil, pathlib
_root = pathlib.Path(__file__).parent.parent
for _finder, _name, _ in pkgutil.walk_packages(
    path=[str(_root / "routes"), str(_root / "services")],
    prefix="",
):
    try:
        _mod = importlib.import_module(_name)
        if hasattr(_mod, "supabase"):
            _mod.supabase = _mock_client
    except Exception:
        pass