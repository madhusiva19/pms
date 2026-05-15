"""
tests/test_routes.py
---------------------
Integration tests for Flask route blueprints.

These tests use Flask's built-in test client and mock the Supabase client
so no real database connection is needed.

Run with:
    pytest tests/test_routes.py -v

Setup
-----
The ``app`` fixture creates a fresh Flask test application with all
blueprints registered and Supabase replaced by a lightweight mock.
"""

import json
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# App factory for testing
# ---------------------------------------------------------------------------

@pytest.fixture
def app():
    """
    Build a Flask test app with all blueprints registered.

    Supabase is patched at the module level so no real DB calls are made.
    """
    from flask import Flask
    from routes.templates     import templates_bp
    from routes.performance   import performance_bp
    from routes.evaluator     import evaluator_bp
    from routes.notifications import notifications_bp
    from routes.org           import org_bp

    flask_app = Flask(__name__)
    flask_app.config["TESTING"] = True

    flask_app.register_blueprint(templates_bp)
    flask_app.register_blueprint(performance_bp)
    flask_app.register_blueprint(evaluator_bp)
    flask_app.register_blueprint(notifications_bp)
    flask_app.register_blueprint(org_bp)

    return flask_app


@pytest.fixture
def client(app):
    """Return a Flask test client bound to the test app."""
    return app.test_client()


@pytest.fixture
def mock_supabase():
    """
    Patch ``utils.db.supabase`` with a MagicMock so every test can
    configure return values without hitting the real database.
    """
    with patch("utils.db.supabase") as mock_sb:
        yield mock_sb


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_execute(data: list | dict):
    """
    Return a mock object whose `.execute()` returns an object with a
    `.data` attribute — matching the Supabase Python client's response shape.
    """
    execute_result      = MagicMock()
    execute_result.data = data

    chain               = MagicMock()
    chain.execute       = MagicMock(return_value=execute_result)

    # Make every chained call (select, eq, order, …) return the same mock
    for method in ("select", "eq", "neq", "in_", "not_", "is_",
                   "order", "limit", "ilike", "update", "insert",
                   "delete", "upsert", "single"):
        getattr(chain, method).return_value = chain

    return chain


# ---------------------------------------------------------------------------
# Templates routes
# ---------------------------------------------------------------------------

class TestGetTemplates:
    """Tests for GET /api/templates."""

    def test_returns_template_list(self, client, mock_supabase):
        # Arrange: Supabase returns two template rows
        fake_data = [
            {"id": 1, "name": "Finance KPI", "status": "active", "created_by": "admin"},
            {"id": 2, "name": "Ops KPI",     "status": "frozen", "created_by": "admin"},
        ]
        mock_supabase.table.return_value = _make_execute(fake_data)

        # Act
        response = client.get("/api/templates")

        # Assert
        assert response.status_code == 200
        body = json.loads(response.data)
        assert len(body) == 2
        assert body[0]["name"] == "Finance KPI"

    def test_returns_empty_list_when_no_templates(self, client, mock_supabase):
        mock_supabase.table.return_value = _make_execute([])

        response = client.get("/api/templates")

        assert response.status_code == 200
        assert json.loads(response.data) == []

    def test_returns_500_on_supabase_error(self, client, mock_supabase):
        # Simulate a Supabase exception
        mock_supabase.table.side_effect = Exception("Connection refused")

        response = client.get("/api/templates")

        assert response.status_code == 500
        assert "error" in json.loads(response.data)


# ---------------------------------------------------------------------------
# Evaluator routes
# ---------------------------------------------------------------------------

class TestGetEvaluatorTeam:
    """Tests for GET /api/evaluator/<id>/team."""

    def test_returns_team_members(self, client, mock_supabase):
        fake_team = [
            {
                "id":           "user-1",
                "full_name":    "Jane Doe",
                "designation_id": 1,
                "emp_id":       "E001",
                "designations": {"name": "Manager"},
            }
        ]
        fake_assignments = []

        # First call → users table; second call → template_assignments
        chain1 = _make_execute(fake_team)
        chain2 = _make_execute(fake_assignments)
        mock_supabase.table.side_effect = [chain1, chain2]

        response = client.get("/api/evaluator/eval-123/team")

        assert response.status_code == 200
        body = json.loads(response.data)
        assert len(body) == 1
        assert body[0]["full_name"] == "Jane Doe"

    def test_returns_empty_list_when_no_reports(self, client, mock_supabase):
        mock_supabase.table.return_value = _make_execute([])

        response = client.get("/api/evaluator/eval-123/team")

        assert response.status_code == 200
        assert json.loads(response.data) == []


# ---------------------------------------------------------------------------
# Notifications routes
# ---------------------------------------------------------------------------

class TestGetNotifications:
    """Tests for GET /api/manual-rating-notifications/<user_id>."""

    def test_returns_notification_list(self, client, mock_supabase):
        fake_notifs = [
            {
                "id":           "notif-1",
                "type":         "period_opened",
                "title":        "Window Open",
                "message":      "Rating window is open.",
                "period":       "H1",
                "pms_year":     2025,
                "is_read":      False,
                "recipient_id": "user-1",
                "sender_id":    None,
                "created_at":   "2025-01-01T00:00:00",
            }
        ]
        mock_supabase.table.return_value = _make_execute(fake_notifs)

        response = client.get("/api/manual-rating-notifications/user-1")

        assert response.status_code == 200
        body = json.loads(response.data)
        assert len(body) == 1
        assert body[0]["type"] == "period_opened"

    def test_returns_empty_list_when_no_notifications(self, client, mock_supabase):
        mock_supabase.table.return_value = _make_execute([])

        response = client.get("/api/manual-rating-notifications/user-1")

        assert response.status_code == 200
        assert json.loads(response.data) == []


class TestMarkNotificationRead:
    """Tests for PATCH /api/manual-rating-notifications/<id>/read."""

    def test_marks_notification_as_read(self, client, mock_supabase):
        mock_supabase.table.return_value = _make_execute([])

        response = client.patch("/api/manual-rating-notifications/notif-1/read")

        assert response.status_code == 200
        assert json.loads(response.data)["success"] is True


class TestSendReminder:
    """Tests for POST /api/manual-rating-notifications/send-reminder."""

    def test_missing_fields_returns_400(self, client, mock_supabase):
        # Payload missing pms_year
        payload = {
            "sender_id":    "mgr-1",
            "recipient_id": "emp-1",
            "period":       "H1",
            # pms_year intentionally omitted
        }
        response = client.post(
            "/api/manual-rating-notifications/send-reminder",
            data=json.dumps(payload),
            content_type="application/json",
        )
        assert response.status_code == 400


# ---------------------------------------------------------------------------
# Org routes
# ---------------------------------------------------------------------------

class TestGetOrgCountries:
    """Tests for GET /api/org/countries."""

    def test_returns_country_list(self, client, mock_supabase):
        fake_countries = [
            {"id": "c1", "name": "Sri Lanka"},
            {"id": "c2", "name": "UAE"},
        ]
        mock_supabase.table.return_value = _make_execute(fake_countries)

        response = client.get("/api/org/countries")

        assert response.status_code == 200
        body = json.loads(response.data)
        # unique_by_name sorts alphabetically: Sri Lanka, UAE
        assert body[0]["name"] == "Sri Lanka"
        assert body[1]["name"] == "UAE"

    def test_deduplicates_same_country_name(self, client, mock_supabase):
        # Two rows with the same name should collapse into one
        fake_countries = [
            {"id": "c1", "name": "Oman"},
            {"id": "c2", "name": "Oman"},
        ]
        mock_supabase.table.return_value = _make_execute(fake_countries)

        response = client.get("/api/org/countries")

        body = json.loads(response.data)
        assert len(body) == 1
        assert len(body[0]["all_ids"]) == 2


# ---------------------------------------------------------------------------
# Route listing (debug endpoint)
# ---------------------------------------------------------------------------

class TestListRoutes:
    """Tests for GET /api/routes."""

    def test_returns_list_of_routes(self, client):
        response = client.get("/api/routes")

        assert response.status_code == 200
        body = json.loads(response.data)
        assert isinstance(body, list)
        # Spot-check that a known route appears
        assert any("/api/templates" in r for r in body)
