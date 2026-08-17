import io
import pytest
from unittest.mock import patch, MagicMock
import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from app import app
from tests.conftest import DEFAULT_CALLER_ID


def _evidence_file(name="certificate.png"):
    return (io.BytesIO(b"fake-image-bytes"), name)


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


# ── GET /api/training/attended/<employee_id> ────────────────────────────────

@patch("services.training_service.supabase")
def test_get_training_attended_success(mock_supabase, client, mock_auth):
    mock_supabase.table.return_value.select.return_value.eq.return_value\
        .order.return_value.execute.return_value.data = [
            {"id": "t1", "training_name": "Excel Advanced"},
        ]

    res = client.get("/api/training/attended/emp-123")
    data = res.get_json()

    assert res.status_code == 200
    assert len(data["trainings"]) == 1


@patch("services.training_service.supabase")
def test_get_training_attended_empty(mock_supabase, client, mock_auth):
    mock_supabase.table.return_value.select.return_value.eq.return_value\
        .order.return_value.execute.return_value.data = []

    res = client.get("/api/training/attended/emp-123")
    assert res.status_code == 200
    assert res.get_json()["trainings"] == []


def test_get_training_attended_unauthenticated(client, mock_auth):
    mock_auth.require_auth.return_value = None
    res = client.get("/api/training/attended/emp-123")
    assert res.status_code == 401


def test_get_training_attended_forbidden(client, mock_auth):
    mock_auth.is_authorized_for.return_value = False
    res = client.get("/api/training/attended/someone-elses-id")
    assert res.status_code == 403


# ── POST /api/training/attended ─────────────────────────────────────────────

@patch("services.training_service.req")
@patch("services.training_service.supabase")
def test_add_training_attended_success(mock_supabase, mock_req, client, mock_auth):
    mock_supabase.table.return_value.insert.return_value\
        .execute.return_value.data = [{"id": "t1"}]
    mock_req.post.return_value = MagicMock(status_code=200, text="")

    res = client.post("/api/training/attended", data={
        "employee_id":      "emp-123",
        "programme_name":   "Excel Advanced",
        "training_date":    "2026-01-10",
        "trainer_provider": "Internal L&D",
        "evidence":         _evidence_file(),
    }, content_type="multipart/form-data")
    assert res.status_code == 201
    assert res.get_json()["message"] == "Training record added"


def test_add_training_attended_missing_fields(client, mock_auth):
    res = client.post("/api/training/attended", data={"employee_id": "emp-123"},
                       content_type="multipart/form-data")
    assert res.status_code == 400


def test_add_training_attended_missing_evidence(client, mock_auth):
    res = client.post("/api/training/attended", data={
        "employee_id": "emp-123", "programme_name": "x",
        "training_date": "2026-01-10", "trainer_provider": "y",
    }, content_type="multipart/form-data")
    assert res.status_code == 400


def test_add_training_attended_unauthenticated(client, mock_auth):
    mock_auth.require_auth.return_value = None
    res = client.post("/api/training/attended", data={
        "employee_id": "emp-123", "programme_name": "x",
        "training_date": "2026-01-10", "trainer_provider": "y",
        "evidence": _evidence_file(),
    }, content_type="multipart/form-data")
    assert res.status_code == 401


def test_add_training_attended_forbidden(client, mock_auth):
    mock_auth.is_authorized_for.return_value = False
    res = client.post("/api/training/attended", data={
        "employee_id": "someone-elses-id", "programme_name": "x",
        "training_date": "2026-01-10", "trainer_provider": "y",
        "evidence": _evidence_file(),
    }, content_type="multipart/form-data")
    assert res.status_code == 403


# ── POST /api/training/suggestions ──────────────────────────────────────────

@patch("services.training_service.supabase")
def test_add_training_suggestion_success(mock_supabase, client, mock_auth):
    mock_supabase.table.return_value.select.return_value.eq.return_value\
        .execute.return_value.data = [{"manager_id": "sup-1"}]
    mock_supabase.table.return_value.insert.return_value\
        .execute.return_value.data = [{"id": "s1"}]

    res = client.post("/api/training/suggestions", json={
        "employee_id":   "emp-123",
        "training_name": "Negotiation Skills",
        "justification": "Needed for client-facing role",
    })
    assert res.status_code == 201
    assert res.get_json()["message"] == "Suggestion submitted"


def test_add_training_suggestion_missing_fields(client, mock_auth):
    res = client.post("/api/training/suggestions", json={"employee_id": "emp-123"})
    assert res.status_code == 400


def test_add_training_suggestion_unauthenticated(client, mock_auth):
    mock_auth.require_auth.return_value = None
    res = client.post("/api/training/suggestions", json={
        "employee_id": "emp-123", "training_name": "x", "justification": "y",
    })
    assert res.status_code == 401


def test_add_training_suggestion_forbidden(client, mock_auth):
    mock_auth.is_authorized_for.return_value = False
    res = client.post("/api/training/suggestions", json={
        "employee_id": "someone-elses-id", "training_name": "x", "justification": "y",
    })
    assert res.status_code == 403


# ── GET /api/training/suggestions/<employee_id> ─────────────────────────────

@patch("services.training_service.supabase")
def test_get_training_suggestions_success(mock_supabase, client, mock_auth):
    mock_supabase.table.return_value.select.return_value.eq.return_value\
        .order.return_value.execute.return_value.data = [{"id": "s1", "status": "pending"}]

    res = client.get("/api/training/suggestions/emp-123")
    assert res.status_code == 200
    assert len(res.get_json()["suggestions"]) == 1


def test_get_training_suggestions_unauthenticated(client, mock_auth):
    mock_auth.require_auth.return_value = None
    res = client.get("/api/training/suggestions/emp-123")
    assert res.status_code == 401


def test_get_training_suggestions_forbidden(client, mock_auth):
    mock_auth.is_authorized_for.return_value = False
    res = client.get("/api/training/suggestions/someone-elses-id")
    assert res.status_code == 403


# ── PATCH /api/training/suggestions/mark-viewed/<employee_id> ──────────────

@patch("services.training_service.supabase")
def test_mark_suggestions_viewed_success(mock_supabase, client, mock_auth):
    res = client.patch("/api/training/suggestions/mark-viewed/emp-123")
    assert res.status_code == 200
    assert res.get_json()["message"] == "Suggestions marked as viewed"


def test_mark_suggestions_viewed_unauthenticated(client, mock_auth):
    mock_auth.require_auth.return_value = None
    res = client.patch("/api/training/suggestions/mark-viewed/emp-123")
    assert res.status_code == 401


def test_mark_suggestions_viewed_forbidden(client, mock_auth):
    mock_auth.is_authorized_for.return_value = False
    res = client.patch("/api/training/suggestions/mark-viewed/someone-elses-id")
    assert res.status_code == 403


# ── GET /api/training/subordinate-suggestions/<supervisor_id> ──────────────

@patch("services.training_service.supabase")
def test_get_subordinate_suggestions_success(mock_supabase, client, mock_auth):
    suggestions_mock = MagicMock()
    suggestions_mock.data = [{"employee_id": "emp-123", "training_name": "x"}]
    users_mock = MagicMock()
    users_mock.data = [{"id": "emp-123", "full_name": "Emp One", "role": "employee"}]

    mock_supabase.table.return_value.select.return_value.eq.return_value\
        .eq.return_value.order.return_value.execute.return_value = suggestions_mock
    mock_supabase.table.return_value.select.return_value.in_.return_value\
        .execute.return_value = users_mock

    res = client.get("/api/training/subordinate-suggestions/sup-1")
    assert res.status_code == 200
    body = res.get_json()["suggestions"]
    assert body[0]["users"]["full_name"] == "Emp One"


def test_get_subordinate_suggestions_unauthenticated(client, mock_auth):
    mock_auth.require_auth.return_value = None
    res = client.get("/api/training/subordinate-suggestions/sup-1")
    assert res.status_code == 401


def test_get_subordinate_suggestions_forbidden(client, mock_auth):
    mock_auth.is_authorized_for.return_value = False
    res = client.get("/api/training/subordinate-suggestions/someone-elses-id")
    assert res.status_code == 403


# ── PATCH /api/training/suggestions/<suggestion_id> ─────────────────────────

@patch("services.training_service.req")
@patch("routes.training_routes.supabase")
def test_review_suggestion_success(mock_route_supabase, mock_req, client, mock_auth):
    mock_route_supabase.table.return_value.select.return_value.eq.return_value\
        .execute.return_value.data = [{"supervisor_id": DEFAULT_CALLER_ID}]

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_req.patch.return_value = mock_response

    res = client.patch("/api/training/suggestions/s1", json={
        "action": "approved", "comment": "Go ahead",
    })
    assert res.status_code == 200
    assert res.get_json()["message"] == "Suggestion approved"


@patch("routes.training_routes.supabase")
def test_review_suggestion_not_found(mock_route_supabase, client, mock_auth):
    mock_route_supabase.table.return_value.select.return_value.eq.return_value\
        .execute.return_value.data = []

    res = client.patch("/api/training/suggestions/missing-id", json={"action": "approved"})
    assert res.status_code == 404


@patch("routes.training_routes.supabase")
def test_review_suggestion_unauthenticated(mock_route_supabase, client, mock_auth):
    mock_auth.require_auth.return_value = None
    res = client.patch("/api/training/suggestions/s1", json={"action": "approved"})
    assert res.status_code == 401


@patch("routes.training_routes.supabase")
def test_review_suggestion_forbidden_when_not_the_supervisor(mock_route_supabase, client, mock_auth):
    """Only the specific supervisor named on the suggestion may review it —
    is_authorized_for's broader hierarchy check does not apply here."""
    mock_route_supabase.table.return_value.select.return_value.eq.return_value\
        .execute.return_value.data = [{"supervisor_id": "someone-else"}]

    res = client.patch("/api/training/suggestions/s1", json={"action": "approved"})
    assert res.status_code == 403


# ── DELETE /api/training/attended/<record_id> ───────────────────────────────

@patch("services.training_service.supabase")
@patch("routes.training_routes.supabase")
def test_delete_training_attended_success(mock_route_supabase, mock_service_supabase, client, mock_auth):
    mock_route_supabase.table.return_value.select.return_value.eq.return_value\
        .execute.return_value.data = [{"user_id": "emp-123"}]

    res = client.delete("/api/training/attended/rec-1")
    assert res.status_code == 200
    assert res.get_json()["message"] == "Training record deleted"


@patch("routes.training_routes.supabase")
def test_delete_training_attended_not_found(mock_route_supabase, client, mock_auth):
    mock_route_supabase.table.return_value.select.return_value.eq.return_value\
        .execute.return_value.data = []

    res = client.delete("/api/training/attended/missing-id")
    assert res.status_code == 404


@patch("routes.training_routes.supabase")
def test_delete_training_attended_unauthenticated(mock_route_supabase, client, mock_auth):
    mock_auth.require_auth.return_value = None
    res = client.delete("/api/training/attended/rec-1")
    assert res.status_code == 401


@patch("routes.training_routes.supabase")
def test_delete_training_attended_forbidden(mock_route_supabase, client, mock_auth):
    mock_route_supabase.table.return_value.select.return_value.eq.return_value\
        .execute.return_value.data = [{"user_id": "emp-123"}]
    mock_auth.is_authorized_for.return_value = False

    res = client.delete("/api/training/attended/rec-1")
    assert res.status_code == 403
