import pytest
from unittest.mock import patch, MagicMock
import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from app import app
from tests.conftest import DEFAULT_CALLER_ID

@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


@patch("services.diary_service.supabase")
def test_save_diary_success(mock_supabase, client, mock_auth):
    """Valid diary entry saves and returns 201."""
    mock_supabase.table.return_value.insert.return_value\
        .execute.return_value.data = [{"id": "diary-1", "status": "approved"}]

    res = client.post("/api/diary/save", json={
        "employee_id": "emp-123",
        "description": "Completed logistics report",
        "entry_date":  "2026-05-13",
    })

    assert res.status_code == 201
    assert res.get_json()["message"] == "Diary entry saved"


def test_save_diary_missing_fields(client, mock_auth):
    """Missing required fields returns 400."""
    res = client.post("/api/diary/save", json={
        "employee_id": "emp-123"
        # missing description and entry_date
    })
    assert res.status_code == 400


def test_save_diary_unauthenticated(client, mock_auth):
    """Missing/invalid auth token returns 401 before touching the DB."""
    mock_auth.require_auth.return_value = None

    res = client.post("/api/diary/save", json={
        "employee_id": "emp-123",
        "description": "Completed logistics report",
        "entry_date":  "2026-05-13",
    })
    assert res.status_code == 401


def test_save_diary_forbidden(client, mock_auth):
    """Caller not authorized for this employee_id gets 403."""
    mock_auth.is_authorized_for.return_value = False

    res = client.post("/api/diary/save", json={
        "employee_id": "someone-elses-id",
        "description": "Completed logistics report",
        "entry_date":  "2026-05-13",
    })
    assert res.status_code == 403


@patch("services.diary_service.supabase")
def test_get_diary(mock_supabase, client, mock_auth):
    """Returns self and supervisor entries for an employee."""

    # Two separate chained calls return different data
    self_mock = MagicMock()
    self_mock.data = [{"id": "d1", "entry_text": "My entry", "author_type": "self"}]

    sup_mock = MagicMock()
    sup_mock.data = []

    mock_supabase.table.return_value.select.return_value\
        .eq.return_value.eq.return_value\
        .order.return_value.execute.side_effect = [self_mock, sup_mock]

    res  = client.get("/api/diary/emp-123")
    data = res.get_json()

    assert res.status_code == 200
    assert "self_entries" in data
    assert "supervisor_entries" in data


def test_get_diary_unauthenticated(client, mock_auth):
    mock_auth.require_auth.return_value = None
    res = client.get("/api/diary/emp-123")
    assert res.status_code == 401


def test_get_diary_forbidden(client, mock_auth):
    mock_auth.is_authorized_for.return_value = False
    res = client.get("/api/diary/someone-elses-id")
    assert res.status_code == 403


# ── POST /api/diary/submit ────────────────────────────────────────────────

@patch("services.diary_service.supabase")
def test_submit_diary_success(mock_supabase, client, mock_auth):
    """Valid submission inserts a pending entry and notifies the supervisor."""
    insert_mock = MagicMock()
    insert_mock.data = [{"id": "diary-2", "status": "pending"}]

    user_mock = MagicMock()
    user_mock.data = [{"full_name": "Emp", "org_level": 6, "manager_id": "sup-1"}]

    supervisor_mock = MagicMock()
    supervisor_mock.data = [{"org_level": 5}]

    notif_mock = MagicMock()
    notif_mock.data = [{"id": "notif-1"}]

    mock_supabase.table.return_value.insert.return_value.execute.return_value = insert_mock
    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.side_effect = [
        user_mock, supervisor_mock,
    ]

    res = client.post("/api/diary/submit", json={
        "employee_id": "emp-123",
        "description": "Completed logistics report",
        "entry_date":  "2026-05-13",
    })

    assert res.status_code == 201
    assert res.get_json()["message"] == "Diary entry submitted for approval"


def test_submit_diary_missing_fields(client, mock_auth):
    res = client.post("/api/diary/submit", json={"employee_id": "emp-123"})
    assert res.status_code == 400


def test_submit_diary_unauthenticated(client, mock_auth):
    mock_auth.require_auth.return_value = None
    res = client.post("/api/diary/submit", json={
        "employee_id": "emp-123", "description": "x", "entry_date": "2026-05-13",
    })
    assert res.status_code == 401


def test_submit_diary_forbidden(client, mock_auth):
    mock_auth.is_authorized_for.return_value = False
    res = client.post("/api/diary/submit", json={
        "employee_id": "someone-elses-id", "description": "x", "entry_date": "2026-05-13",
    })
    assert res.status_code == 403


# ── POST /api/diary/supervisor ──────────────────────────────────────────────

@patch("services.diary_service.supabase")
def test_add_supervisor_diary_success(mock_supabase, client, mock_auth):
    mock_supabase.table.return_value.insert.return_value\
        .execute.return_value.data = [{"id": "diary-3", "status": "approved"}]

    res = client.post("/api/diary/supervisor", json={
        "employee_id":   "emp-123",
        "supervisor_id": DEFAULT_CALLER_ID,  # matches mock_auth.DEFAULT_CALLER_ID
        "description":   "Great work this month",
        "entry_date":    "2026-05-13",
    })

    assert res.status_code == 201
    assert res.get_json()["message"] == "Supervisor comment added"


def test_add_supervisor_diary_missing_fields(client, mock_auth):
    res = client.post("/api/diary/supervisor", json={
        "employee_id": "emp-123", "supervisor_id": DEFAULT_CALLER_ID,
    })
    assert res.status_code == 400


def test_add_supervisor_diary_unauthenticated(client, mock_auth):
    mock_auth.require_auth.return_value = None
    res = client.post("/api/diary/supervisor", json={
        "employee_id": "emp-123", "supervisor_id": "sup-1",
        "description": "x", "entry_date": "2026-05-13",
    })
    assert res.status_code == 401


def test_add_supervisor_diary_forbidden_when_supervisor_id_spoofed(client, mock_auth):
    """Caller must be the declared supervisor_id, not just any authorized user."""
    res = client.post("/api/diary/supervisor", json={
        "employee_id": "emp-123", "supervisor_id": "someone-else",
        "description": "x", "entry_date": "2026-05-13",
    })
    assert res.status_code == 403


def test_add_supervisor_diary_forbidden_when_not_in_reporting_chain(client, mock_auth):
    mock_auth.is_authorized_for.return_value = False
    res = client.post("/api/diary/supervisor", json={
        "employee_id": "emp-123", "supervisor_id": DEFAULT_CALLER_ID,
        "description": "x", "entry_date": "2026-05-13",
    })
    assert res.status_code == 403


def test_add_supervisor_diary_forbidden_when_self_authored(client, mock_auth):
    """A user cannot write a pre-approved 'supervisor' comment about themselves,
    even though is_authorized_for's self-access shortcut would otherwise allow
    caller_id == employee_id."""
    res = client.post("/api/diary/supervisor", json={
        "employee_id": DEFAULT_CALLER_ID, "supervisor_id": DEFAULT_CALLER_ID,
        "description": "x", "entry_date": "2026-05-13",
    })
    assert res.status_code == 403


# ── PATCH /api/diary/<id>/approve ───────────────────────────────────────────

@patch("services.diary_service.supabase")
@patch("routes.diary_routes.supabase")
def test_approve_diary_success(mock_route_supabase, mock_service_supabase, client, mock_auth):
    mock_route_supabase.table.return_value.select.return_value\
        .eq.return_value.execute.return_value.data = [{"user_id": "emp-123"}]

    update_mock = MagicMock()
    update_mock.data = [{"user_id": "emp-123", "entry_text": "Report"}]
    user_mock = MagicMock()
    user_mock.data = [{"org_level": 6}]

    mock_service_supabase.table.return_value.update.return_value\
        .eq.return_value.eq.return_value.execute.return_value = update_mock
    mock_service_supabase.table.return_value.select.return_value\
        .eq.return_value.execute.return_value = user_mock

    res = client.patch("/api/diary/diary-1/approve", json={"reviewer_id": DEFAULT_CALLER_ID})
    assert res.status_code == 200
    assert res.get_json()["message"] == "Diary entry approved"


@patch("routes.diary_routes.supabase")
def test_approve_diary_not_found(mock_route_supabase, client, mock_auth):
    mock_route_supabase.table.return_value.select.return_value\
        .eq.return_value.execute.return_value.data = []

    res = client.patch("/api/diary/missing-id/approve", json={"reviewer_id": DEFAULT_CALLER_ID})
    assert res.status_code == 404


@patch("routes.diary_routes.supabase")
def test_approve_diary_unauthenticated(mock_route_supabase, client, mock_auth):
    mock_auth.require_auth.return_value = None
    res = client.patch("/api/diary/diary-1/approve", json={"reviewer_id": DEFAULT_CALLER_ID})
    assert res.status_code == 401


@patch("routes.diary_routes.supabase")
def test_approve_diary_forbidden_not_authorized_for_owner(mock_route_supabase, client, mock_auth):
    mock_route_supabase.table.return_value.select.return_value\
        .eq.return_value.execute.return_value.data = [{"user_id": "emp-123"}]
    mock_auth.is_authorized_for.return_value = False

    res = client.patch("/api/diary/diary-1/approve", json={"reviewer_id": DEFAULT_CALLER_ID})
    assert res.status_code == 403


@patch("routes.diary_routes.supabase")
def test_approve_diary_forbidden_reviewer_id_spoofed(mock_route_supabase, client, mock_auth):
    """reviewer_id in the body must match the authenticated caller."""
    mock_route_supabase.table.return_value.select.return_value\
        .eq.return_value.execute.return_value.data = [{"user_id": "emp-123"}]

    res = client.patch("/api/diary/diary-1/approve", json={"reviewer_id": "someone-else"})
    assert res.status_code == 403


@patch("routes.diary_routes.supabase")
def test_approve_diary_forbidden_when_self_approving(mock_route_supabase, client, mock_auth):
    """An employee cannot approve their own diary entry, even though
    is_authorized_for's self-access shortcut would otherwise allow it."""
    mock_route_supabase.table.return_value.select.return_value\
        .eq.return_value.execute.return_value.data = [{"user_id": DEFAULT_CALLER_ID}]

    res = client.patch("/api/diary/diary-1/approve", json={"reviewer_id": DEFAULT_CALLER_ID})
    assert res.status_code == 403


# ── PATCH /api/diary/<id>/reject ────────────────────────────────────────────

@patch("services.diary_service.supabase")
@patch("routes.diary_routes.supabase")
def test_reject_diary_success(mock_route_supabase, mock_service_supabase, client, mock_auth):
    mock_route_supabase.table.return_value.select.return_value\
        .eq.return_value.execute.return_value.data = [{"user_id": "emp-123"}]

    update_mock = MagicMock()
    update_mock.data = [{"user_id": "emp-123", "entry_text": "Report"}]
    user_mock = MagicMock()
    user_mock.data = [{"org_level": 6}]

    mock_service_supabase.table.return_value.update.return_value\
        .eq.return_value.eq.return_value.execute.return_value = update_mock
    mock_service_supabase.table.return_value.select.return_value\
        .eq.return_value.execute.return_value = user_mock

    res = client.patch("/api/diary/diary-1/reject", json={"reviewer_id": DEFAULT_CALLER_ID})
    assert res.status_code == 200
    assert res.get_json()["message"] == "Diary entry rejected"


@patch("routes.diary_routes.supabase")
def test_reject_diary_not_found(mock_route_supabase, client, mock_auth):
    mock_route_supabase.table.return_value.select.return_value\
        .eq.return_value.execute.return_value.data = []

    res = client.patch("/api/diary/missing-id/reject", json={"reviewer_id": DEFAULT_CALLER_ID})
    assert res.status_code == 404


@patch("routes.diary_routes.supabase")
def test_reject_diary_forbidden_when_self_rejecting(mock_route_supabase, client, mock_auth):
    """An employee cannot reject their own diary entry."""
    mock_route_supabase.table.return_value.select.return_value\
        .eq.return_value.execute.return_value.data = [{"user_id": DEFAULT_CALLER_ID}]

    res = client.patch("/api/diary/diary-1/reject", json={"reviewer_id": DEFAULT_CALLER_ID})
    assert res.status_code == 403


# ── DELETE /api/diary/<id> ──────────────────────────────────────────────────

@patch("services.diary_service.supabase")
@patch("routes.diary_routes.supabase")
def test_delete_diary_success(mock_route_supabase, mock_service_supabase, client, mock_auth):
    mock_route_supabase.table.return_value.select.return_value\
        .eq.return_value.execute.return_value.data = [{"user_id": "emp-123"}]

    res = client.delete("/api/diary/diary-1")
    assert res.status_code == 200
    assert res.get_json()["message"] == "Entry deleted"


@patch("routes.diary_routes.supabase")
def test_delete_diary_not_found(mock_route_supabase, client, mock_auth):
    mock_route_supabase.table.return_value.select.return_value\
        .eq.return_value.execute.return_value.data = []

    res = client.delete("/api/diary/missing-id")
    assert res.status_code == 404


@patch("routes.diary_routes.supabase")
def test_delete_diary_unauthenticated(mock_route_supabase, client, mock_auth):
    mock_auth.require_auth.return_value = None
    res = client.delete("/api/diary/diary-1")
    assert res.status_code == 401


@patch("routes.diary_routes.supabase")
def test_delete_diary_forbidden(mock_route_supabase, client, mock_auth):
    mock_route_supabase.table.return_value.select.return_value\
        .eq.return_value.execute.return_value.data = [{"user_id": "emp-123"}]
    mock_auth.is_authorized_for.return_value = False

    res = client.delete("/api/diary/diary-1")
    assert res.status_code == 403