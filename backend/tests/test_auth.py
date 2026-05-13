import pytest
from unittest.mock import patch, MagicMock
import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from app import app

@pytest.fixture
def client():
    """Creates a test client for Flask."""
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


# ── LOGIN TESTS ──────────────────────────────────────────

@patch("app.req.post")
@patch("app.supabase")
def test_login_success(mock_supabase, mock_post, client):
    """Valid credentials return 200 with user data and redirect."""

    # Mock Supabase Auth response
    mock_auth_response = MagicMock()
    mock_auth_response.status_code = 200
    mock_auth_response.json.return_value = {
        "user": {"id": "user-uuid-123"}
    }
    mock_post.return_value = mock_auth_response

    # Mock DB user lookup
    mock_supabase.table.return_value.select.return_value\
        .eq.return_value.execute.return_value.data = [{
            "id":         "user-uuid-123",
            "email":      "test@dgl.com",
            "full_name":  "Test User",
            "role":       "employee",
            "org_level":  6,
            "iata_branch_code": "CMB",
            "country_id": "lk",
            "branch_id":  "branch-1",
            "department_id":     None,
            "sub_department_id": None,
            "avatar_url":        None,
        }]

    res  = client.post("/api/auth/login",
                       json={"email": "test@dgl.com", "password": "password123"})
    data = res.get_json()

    assert res.status_code == 200
    assert data["message"] == "Login successful"
    assert data["redirect"] == "/employee/profile"
    assert data["user"]["role"] == "employee"


@patch("app.req.post")
def test_login_wrong_password(mock_post, client):
    """Wrong password returns 401."""
    mock_response = MagicMock()
    mock_response.status_code = 401
    mock_post.return_value = mock_response

    res = client.post("/api/auth/login",
                      json={"email": "test@dgl.com", "password": "wrongpass"})

    assert res.status_code == 401
    assert "Invalid" in res.get_json()["message"]


def test_login_missing_fields(client):
    """Missing email or password returns 400."""
    res = client.post("/api/auth/login", json={"email": ""})
    assert res.status_code == 400

    res = client.post("/api/auth/login", json={"password": "abc"})
    assert res.status_code == 400


# ── RESET PASSWORD TESTS ─────────────────────────────────

@patch("app.req.post")
def test_reset_password_success(mock_post, client):
    """Valid token and password returns 200."""

    # First call = verify, Second call = update (PUT)
    mock_verify = MagicMock()
    mock_verify.status_code = 200
    mock_verify.json.return_value = {"access_token": "fake-access-token"}

    mock_update = MagicMock()
    mock_update.status_code = 200

    mock_post.side_effect = [mock_verify]

    with patch("app.req.put", return_value=mock_update):
        res = client.post("/api/auth/reset-password", json={
            "token":    "valid-token-hash",
            "password": "NewPassword123"
        })

    assert res.status_code == 200
    assert res.get_json()["message"] == "Password reset successfully"


@patch("app.req.post")
def test_reset_password_invalid_token(mock_post, client):
    """Expired or invalid token returns 400."""
    mock_verify = MagicMock()
    mock_verify.status_code = 400
    mock_verify.json.return_value = {"message": "Token expired"}
    mock_post.return_value = mock_verify

    res = client.post("/api/auth/reset-password", json={
        "token":    "expired-token",
        "password": "NewPassword123"
    })

    assert res.status_code == 400


def test_reset_password_too_short(client):
    """Password under 8 characters returns 400 before hitting Supabase."""
    res = client.post("/api/auth/reset-password", json={
        "token":    "some-token",
        "password": "short"
    })
    assert res.status_code == 400
    assert "8 characters" in res.get_json()["message"]


def test_reset_password_missing_fields(client):
    """Missing token or password returns 400."""
    res = client.post("/api/auth/reset-password", json={"password": "abc12345"})
    assert res.status_code == 400