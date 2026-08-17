"""
tests/conftest.py
------------------
Patches Supabase and APScheduler BEFORE any module imports them.
"""

import sys, os
import pytest
from unittest.mock import MagicMock, patch

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
sys.modules["apscheduler.triggers.interval"]     = _aps

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


# ── 6. Shared auth-guard mocking fixture ──────────────────────────────────
#
# require_auth() normally makes a live HTTP call to Supabase to verify the
# bearer token, and is_authorized_for() normally queries the `users` table.
# Route modules import both names directly (`from utils.auth_guard import
# require_auth, is_authorized_for`), so each module gets its own bound copy
# that must be patched at the point of use.
#
# `mock_auth` patches require_auth + is_authorized_for in every route module
# that guards its routes with them. By default require_auth returns
# DEFAULT_CALLER_ID and is_authorized_for returns True (caller is allowed) —
# override `mock_auth.require_auth.return_value` /
# `mock_auth.is_authorized_for.return_value` per-test to exercise 401/403
# paths.

DEFAULT_CALLER_ID = "caller-uuid-1"

_AUTH_GUARDED_MODULES = [
    "routes.diary_routes",
    "routes.profile_routes",
    "routes.training_routes",
    "routes.dashboard_routes",
    "routes.notification_routes",
]


@pytest.fixture
def mock_auth():
    patchers = []
    require_auth_mock = MagicMock(return_value=DEFAULT_CALLER_ID)
    is_authorized_mock = MagicMock(return_value=True)

    for module_path in _AUTH_GUARDED_MODULES:
        try:
            module = importlib.import_module(module_path)
        except Exception:
            continue
        if hasattr(module, "require_auth"):
            p = patch.object(module, "require_auth", require_auth_mock)
            p.start()
            patchers.append(p)
        if hasattr(module, "is_authorized_for"):
            p = patch.object(module, "is_authorized_for", is_authorized_mock)
            p.start()
            patchers.append(p)

    holder = MagicMock()
    holder.require_auth = require_auth_mock
    holder.is_authorized_for = is_authorized_mock

    yield holder

    for p in patchers:
        p.stop()