import io
import pytest
from unittest.mock import patch, MagicMock
import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from app import app

@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


@patch("services.profile_service.supabase")
def test_get_profile_success(mock_supabase, client, mock_auth):
    """Returns profile with flattened designation name."""
    def table_mock(table_name):
        mock_t = MagicMock()
        if table_name == "users":
            mock_t.select.return_value.eq.return_value.execute.return_value.data = [{
                "id":           "emp-123",
                "full_name":    "Madhu Test",
                "email":        "madhu@dgl.com",
                "designations": {"name": "Senior Analyst"}
            }]
        else:
            mock_t.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = []
        return mock_t

    mock_supabase.table.side_effect = table_mock

    res  = client.get("/api/profile/emp-123")
    data = res.get_json()

    assert res.status_code == 200
    assert data["profile"]["designation"] == "Senior Analyst"
    assert data["profile"]["full_name"]   == "Madhu Test"


@patch("services.profile_service.supabase")
def test_get_profile_not_found(mock_supabase, client, mock_auth):
    """Non-existent employee returns 404."""
    mock_supabase.table.return_value.select.return_value\
        .eq.return_value.execute.return_value.data = []

    res = client.get("/api/profile/nonexistent-id")
    assert res.status_code == 404
    assert res.get_json()["message"] == "User not found"


def test_get_profile_unauthenticated(client, mock_auth):
    """Missing/invalid auth token returns 401 before touching the DB."""
    mock_auth.require_auth.return_value = None

    res = client.get("/api/profile/emp-123")
    assert res.status_code == 401


def test_get_profile_forbidden(client, mock_auth):
    """Authenticated caller who isn't authorized for this employee gets 403."""
    mock_auth.is_authorized_for.return_value = False

    res = client.get("/api/profile/someone-elses-id")
    assert res.status_code == 403


# ── POST /api/profile/upload-avatar ─────────────────────────────────────────

@patch("services.profile_service.req")
@patch("services.profile_service.supabase")
def test_upload_avatar_success(mock_supabase, mock_req, client, mock_auth):
    mock_supabase.table.return_value.select.return_value.eq.return_value\
        .execute.return_value.data = [{"avatar_url": None}]

    mock_upload_res = MagicMock()
    mock_upload_res.status_code = 200
    mock_req.post.return_value = mock_upload_res

    res = client.post("/api/profile/upload-avatar", data={
        "employee_id": "emp-123",
        "file": (io.BytesIO(b"fake image bytes"), "avatar.png", "image/png"),
    }, content_type="multipart/form-data")

    assert res.status_code == 200
    assert "avatar_url" in res.get_json()


def test_upload_avatar_missing_file(client, mock_auth):
    res = client.post("/api/profile/upload-avatar", data={
        "employee_id": "emp-123",
    }, content_type="multipart/form-data")
    assert res.status_code == 400


@patch("services.profile_service.supabase")
def test_upload_avatar_rejects_disallowed_type(mock_supabase, client, mock_auth):
    res = client.post("/api/profile/upload-avatar", data={
        "employee_id": "emp-123",
        "file": (io.BytesIO(b"not an image"), "malware.exe", "application/octet-stream"),
    }, content_type="multipart/form-data")
    assert res.status_code == 400


def test_upload_avatar_unauthenticated(client, mock_auth):
    mock_auth.require_auth.return_value = None
    res = client.post("/api/profile/upload-avatar", data={
        "employee_id": "emp-123",
        "file": (io.BytesIO(b"fake image bytes"), "avatar.png", "image/png"),
    }, content_type="multipart/form-data")
    assert res.status_code == 401


def test_upload_avatar_forbidden(client, mock_auth):
    mock_auth.is_authorized_for.return_value = False
    res = client.post("/api/profile/upload-avatar", data={
        "employee_id": "someone-elses-id",
        "file": (io.BytesIO(b"fake image bytes"), "avatar.png", "image/png"),
    }, content_type="multipart/form-data")
    assert res.status_code == 403


# ── DELETE /api/profile/remove-avatar/<employee_id> ─────────────────────────

@patch("services.profile_service.req")
@patch("services.profile_service.supabase")
def test_remove_avatar_success(mock_supabase, mock_req, client, mock_auth):
    mock_supabase.table.return_value.select.return_value.eq.return_value\
        .execute.return_value.data = [{"avatar_url": "https://x/storage/v1/object/public/avatars/emp-123.png"}]

    res = client.delete("/api/profile/remove-avatar/emp-123")
    assert res.status_code == 200
    assert res.get_json()["message"] == "Avatar removed"


@patch("services.profile_service.supabase")
def test_remove_avatar_no_existing_avatar(mock_supabase, client, mock_auth):
    mock_supabase.table.return_value.select.return_value.eq.return_value\
        .execute.return_value.data = [{"avatar_url": None}]

    res = client.delete("/api/profile/remove-avatar/emp-123")
    assert res.status_code == 200
    assert res.get_json()["message"] == "Avatar removed"


def test_remove_avatar_unauthenticated(client, mock_auth):
    mock_auth.require_auth.return_value = None
    res = client.delete("/api/profile/remove-avatar/emp-123")
    assert res.status_code == 401


def test_remove_avatar_forbidden(client, mock_auth):
    mock_auth.is_authorized_for.return_value = False
    res = client.delete("/api/profile/remove-avatar/someone-elses-id")
    assert res.status_code == 403