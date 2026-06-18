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
def test_get_profile_success(mock_supabase, client):
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
def test_get_profile_not_found(mock_supabase, client):
    """Non-existent employee returns 404."""
    mock_supabase.table.return_value.select.return_value\
        .eq.return_value.execute.return_value.data = []

    res = client.get("/api/profile/nonexistent-id")
    assert res.status_code == 404
    assert res.get_json()["message"] == "User not found"