"""
tests/test_integration_diary_notification.py
-----------------------------------------------
Cross-module integration test: diary submit -> supervisor approve ->
notification triggered. Exercises diary_bp and notification_bp together
through the real Flask test client and the real service-layer logic
(diary_service, notification_service) — only the Supabase client itself is
faked, with an in-memory table store, so the actual business logic (diary
status transitions, notification inserts, notification retrieval) all runs
for real rather than being mocked away route-by-route.
"""

import itertools
import pytest
import sys, os
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from app import app
from tests.conftest import DEFAULT_CALLER_ID


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    """Minimal chainable query builder mimicking the subset of the Supabase
    client used by diary_service/notification_service: select/insert/update/
    delete + eq filters + order, resolved on .execute()."""

    def __init__(self, store, table_name):
        self._store   = store
        self._table   = table_name
        self._filters = {}
        self._op      = None
        self._payload = None
        self._order_by = None
        self._order_desc = False

    def select(self, *_args, **_kwargs):
        self._op = "select"
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = payload
        return self

    def delete(self):
        self._op = "delete"
        return self

    def eq(self, col, val):
        self._filters[col] = val
        return self

    def order(self, col, desc=False):
        self._order_by, self._order_desc = col, desc
        return self

    def _matches(self, row):
        return all(row.get(k) == v for k, v in self._filters.items())

    def execute(self):
        rows = self._store.setdefault(self._table, [])

        if self._op == "insert":
            new_row = dict(self._payload)
            new_row.setdefault("id", f"{self._table}-{len(rows) + 1}")
            rows.append(new_row)
            return _Result([new_row])

        matched = [r for r in rows if self._matches(r)]

        if self._op == "update":
            for r in matched:
                r.update(self._payload)
            return _Result(matched)

        if self._op == "delete":
            self._store[self._table] = [r for r in rows if not self._matches(r)]
            return _Result(matched)

        # select
        if self._order_by:
            matched = sorted(matched, key=lambda r: r.get(self._order_by) or "",
                              reverse=self._order_desc)
        return _Result(matched)


class FakeSupabase:
    """Shared in-memory backing store standing in for Supabase across all
    the service modules involved in the flow."""

    def __init__(self):
        self._store = {}

    def seed(self, table_name, rows):
        self._store[table_name] = [dict(r) for r in rows]

    def table(self, name):
        return _Query(self._store, name)


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


@pytest.fixture
def fake_db():
    db = FakeSupabase()
    db.seed("users", [
        {"id": "emp-123", "full_name": "Jordan Employee", "org_level": 6,
         "manager_id": "sup-1"},
        {"id": "sup-1", "full_name": "Sam Supervisor", "org_level": 5},
    ])
    with patch("services.diary_service.supabase", db), \
         patch("routes.diary_routes.supabase", db), \
         patch("services.notification_service.supabase", db):
        yield db


def test_diary_submit_then_approve_triggers_notification(client, fake_db, mock_auth):
    # ── Step 1: employee submits a diary entry ──────────────────────────────
    mock_auth.require_auth.return_value = "emp-123"

    submit_res = client.post("/api/diary/submit", json={
        "employee_id": "emp-123",
        "description": "Closed 12 support tickets this week",
        "entry_date":  "2026-08-10",
    })
    assert submit_res.status_code == 201
    diary_id = submit_res.get_json()["data"]["id"]

    # The supervisor should now have a pending-approval notification.
    supervisor_notifs = fake_db._store["notifications"]
    assert len(supervisor_notifs) == 1
    assert supervisor_notifs[0]["receiver_id"] == "sup-1"
    assert supervisor_notifs[0]["type"] == "diary_approval"

    # ── Step 2: supervisor approves it ──────────────────────────────────────
    mock_auth.require_auth.return_value = "sup-1"

    approve_res = client.patch(f"/api/diary/{diary_id}/approve", json={
        "reviewer_id": "sup-1",
    })
    assert approve_res.status_code == 200
    assert approve_res.get_json()["message"] == "Diary entry approved"

    diary_rows = fake_db._store["performance_diary"]
    assert diary_rows[0]["status"] == "approved"
    assert diary_rows[0]["reviewed_by"] == "sup-1"

    # ── Step 3: the employee now has an approval notification ──────────────
    all_notifs = fake_db._store["notifications"]
    employee_notifs = [n for n in all_notifs if n["receiver_id"] == "emp-123"]
    assert len(employee_notifs) == 1
    assert employee_notifs[0]["type"] == "diary_approval"
    assert "Approved" in employee_notifs[0]["title"]

    # ── Step 4: employee fetches their notifications via notification_bp ───
    mock_auth.require_auth.return_value = "emp-123"

    notif_res = client.get("/api/notifications/emp-123")
    assert notif_res.status_code == 200
    fetched = notif_res.get_json()["notifications"]
    assert any(n["type"] == "diary_approval" and "Approved" in n["title"] for n in fetched)


def test_diary_submit_then_reject_triggers_rejection_notification(client, fake_db, mock_auth):
    mock_auth.require_auth.return_value = "emp-123"
    submit_res = client.post("/api/diary/submit", json={
        "employee_id": "emp-123",
        "description": "Draft report",
        "entry_date":  "2026-08-10",
    })
    diary_id = submit_res.get_json()["data"]["id"]

    mock_auth.require_auth.return_value = "sup-1"
    reject_res = client.patch(f"/api/diary/{diary_id}/reject", json={
        "reviewer_id": "sup-1",
    })
    assert reject_res.status_code == 200

    diary_rows = fake_db._store["performance_diary"]
    assert diary_rows[0]["status"] == "rejected"

    employee_notifs = [n for n in fake_db._store["notifications"] if n["receiver_id"] == "emp-123"]
    assert any("Rejected" in n["title"] for n in employee_notifs)


def test_non_supervisor_cannot_approve_someone_elses_diary(client, fake_db, mock_auth):
    """Security regression check within the same flow: an unrelated employee
    (not in the reporting chain) must not be able to approve the diary."""
    mock_auth.require_auth.return_value = "emp-123"
    submit_res = client.post("/api/diary/submit", json={
        "employee_id": "emp-123",
        "description": "Draft report",
        "entry_date":  "2026-08-10",
    })
    diary_id = submit_res.get_json()["data"]["id"]

    mock_auth.require_auth.return_value = "random-other-employee"
    mock_auth.is_authorized_for.return_value = False

    approve_res = client.patch(f"/api/diary/{diary_id}/approve", json={
        "reviewer_id": "random-other-employee",
    })
    assert approve_res.status_code == 403

    diary_rows = fake_db._store["performance_diary"]
    assert diary_rows[0]["status"] == "pending"
