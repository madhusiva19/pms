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


@patch("services.diary_service.supabase")
def test_save_diary_success(mock_supabase, client):
    """Valid diary entry saves and returns 201."""
    mock_supabase.table.return_value.insert.return_value\
        .execute.return_value.data = [{"id": "diary-1", "status": "approved"}]

    res = client.post("/api/diary/save", json={
        "employee_id": "emp-123",
        "description": "Completed logistics report",
        "entry_date":  "2026-05-13",
        "cycle_id":    "cycle-1"
    })

    assert res.status_code == 201
    assert res.get_json()["message"] == "Diary entry saved"


def test_save_diary_missing_fields(client):
    """Missing required fields returns 400."""
    res = client.post("/api/diary/save", json={
        "employee_id": "emp-123"
        # missing description and entry_date
    })
    assert res.status_code == 400


@patch("services.diary_service.supabase")
def test_get_diary(mock_supabase, client):
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