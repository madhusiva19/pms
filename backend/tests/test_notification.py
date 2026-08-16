"""
Unit Tests — Notification Service
-----------------------------------
Tests for the in-app notification system of the EPMS application.
Covers fetching notifications and marking as read.

Run with: pytest tests/test_notification.py -v
"""

import pytest
import json
from unittest.mock import patch, MagicMock
import sys
import os

# Add backend root to path so imports work correctly
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import app


# ── Test Configuration ────────────────────────────────────────────────────────

@pytest.fixture
def client():
    """
    Creates a Flask test client for making HTTP requests in tests.
    Sets testing=True to disable error propagation and enable test mode.
    """
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


# ── Sample Test Data ──────────────────────────────────────────────────────────

SAMPLE_EMPLOYEE_ID     = "f742e63f-ab23-4b18-803b-d9a7eb322b8c"
SAMPLE_NOTIFICATION_ID = "a1b2c3d4-0000-0000-0000-000000000001"

SAMPLE_NOTIFICATIONS = [
    {
        "id":           SAMPLE_NOTIFICATION_ID,
        "receiver_id":  SAMPLE_EMPLOYEE_ID,
        "type":         "diary_approval",
        "title":        "Achievement Approved ✅",
        "message":      "Your diary entry has been approved.",
        "is_read":      False,
        "triggered_by": "system",
        "action_link":  "/employee/profile",
        "created_at":   "2026-05-01T08:00:00"
    },
]


# ── GET /api/notifications/<employee_id> Tests ────────────────────────────────

class TestGetNotifications:
    """Tests for fetching notifications for a specific employee."""

    def test_get_notifications_success(self, client, mock_auth):
        """
        Should return all notifications for a valid employee ID.
        Verifies correct HTTP status and response structure.
        """
        mock_result      = MagicMock()
        mock_result.data = SAMPLE_NOTIFICATIONS

        with patch("services.notification_service.supabase") as mock_db:
            mock_db.table.return_value\
                .select.return_value\
                .eq.return_value\
                .order.return_value\
                .execute.return_value = mock_result

            response = client.get(f"/api/notifications/{SAMPLE_EMPLOYEE_ID}")
            data     = json.loads(response.data)

            assert response.status_code == 200
            assert "notifications" in data
            assert len(data["notifications"]) == 1

    def test_get_notifications_returns_unread(self, client, mock_auth):
        """
        Verifies unread notifications appear in the returned list.
        Frontend uses this to calculate badge count.
        """
        mock_result      = MagicMock()
        mock_result.data = SAMPLE_NOTIFICATIONS

        with patch("services.notification_service.supabase") as mock_db:
            mock_db.table.return_value\
                .select.return_value\
                .eq.return_value\
                .order.return_value\
                .execute.return_value = mock_result

            response      = client.get(f"/api/notifications/{SAMPLE_EMPLOYEE_ID}")
            data          = json.loads(response.data)
            notifications = data["notifications"]

            unread = [n for n in notifications if not n["is_read"]]
            assert len(unread) == 1
            assert unread[0]["title"] == "Achievement Approved ✅"

    def test_get_notifications_empty(self, client, mock_auth):
        """
        Should return empty array when no notifications exist for the user.
        """
        mock_result      = MagicMock()
        mock_result.data = []

        with patch("services.notification_service.supabase") as mock_db:
            mock_db.table.return_value\
                .select.return_value\
                .eq.return_value\
                .order.return_value\
                .execute.return_value = mock_result

            response = client.get(f"/api/notifications/{SAMPLE_EMPLOYEE_ID}")
            data     = json.loads(response.data)

            assert response.status_code == 200
            assert data["notifications"] == []

    def test_get_notifications_invalid_employee(self, client, mock_auth):
        """
        Should return 200 with empty list for non-existent employee ID.
        Database returns empty result rather than an error.
        """
        mock_result      = MagicMock()
        mock_result.data = []

        with patch("services.notification_service.supabase") as mock_db:
            mock_db.table.return_value\
                .select.return_value\
                .eq.return_value\
                .order.return_value\
                .execute.return_value = mock_result

            response = client.get("/api/notifications/invalid-uuid-here")
            data     = json.loads(response.data)

            assert response.status_code == 200
            assert "notifications" in data


# ── PATCH /api/notifications/<id>/read Tests ─────────────────────────────────
#
# NOTE: notifications_bp registers PATCH /notifications/<notif_id>/read
# (url_prefix "/api") *before* notification_bp registers PATCH
# /<notification_id>/read (url_prefix "/api/notifications") — both resolve to
# the identical URL /api/notifications/<id>/read, so the first one always
# wins Flask's routing. These tests exercise the handler that is actually
# reachable (routes.notification_routes.mark_notification_read), which
# updates the `notifications` table directly via the Supabase client rather
# than a raw REST PATCH call.

class TestMarkNotificationRead:
    """Tests for marking a notification as read."""

    def test_mark_as_read_success(self, client, mock_auth):
        """Should successfully mark a notification as read."""
        with patch("routes.notification_routes.supabase") as mock_db:
            mock_db.table.return_value.select.return_value.eq.return_value\
                .execute.return_value.data = [{"receiver_id": None}]

            response = client.patch(f"/api/notifications/{SAMPLE_NOTIFICATION_ID}/read")
            data     = json.loads(response.data)

            assert response.status_code == 200
            assert data["message"] == "Marked as read"

    def test_mark_as_read_unauthenticated(self, client, mock_auth):
        """Missing/invalid auth token returns 401 before touching the DB."""
        mock_auth.require_auth.return_value = None

        response = client.patch(f"/api/notifications/{SAMPLE_NOTIFICATION_ID}/read")
        assert response.status_code == 401

    def test_mark_as_read_forbidden_for_other_users_notification(self, client, mock_auth):
        """A notification with a receiver_id belonging to someone else can't be marked read."""
        mock_auth.is_authorized_for.return_value = False

        with patch("routes.notification_routes.supabase") as mock_db:
            mock_db.table.return_value.select.return_value.eq.return_value\
                .execute.return_value.data = [{"receiver_id": "someone-else"}]

            response = client.patch(f"/api/notifications/{SAMPLE_NOTIFICATION_ID}/read")
            assert response.status_code == 403

    def test_mark_as_read_database_failure(self, client, mock_auth):
        """Should return 400 when the database update raises."""
        with patch("routes.notification_routes.supabase") as mock_db:
            mock_db.table.return_value.select.return_value.eq.return_value\
                .execute.return_value.data = [{"receiver_id": None}]
            mock_db.table.return_value.update.return_value.eq.return_value\
                .execute.side_effect = Exception("db unavailable")

            response = client.patch(f"/api/notifications/{SAMPLE_NOTIFICATION_ID}/read")
            data     = json.loads(response.data)

            assert response.status_code == 400
            assert "db unavailable" in data["error"]

    def test_mark_as_read_sends_correct_payload(self, client, mock_auth):
        """Verifies that is_read: True is sent to the database update call."""
        with patch("routes.notification_routes.supabase") as mock_db:
            mock_db.table.return_value.select.return_value.eq.return_value\
                .execute.return_value.data = [{"receiver_id": None}]

            client.patch(f"/api/notifications/{SAMPLE_NOTIFICATION_ID}/read")

            update_call_args = mock_db.table.return_value.update.call_args
            assert update_call_args[0][0]["is_read"] is True


# ── Notification Content Validation Tests ────────────────────────────────────

class TestNotificationContent:
    """Tests for validating notification data structure and content."""

    def test_notification_has_required_fields(self, client, mock_auth):
        """
        Verifies each notification object contains all required fields
        needed by the frontend notification panel.
        """
        mock_result      = MagicMock()
        mock_result.data = SAMPLE_NOTIFICATIONS

        with patch("services.notification_service.supabase") as mock_db:
            mock_db.table.return_value\
                .select.return_value\
                .eq.return_value\
                .order.return_value\
                .execute.return_value = mock_result

            response     = client.get(f"/api/notifications/{SAMPLE_EMPLOYEE_ID}")
            data         = json.loads(response.data)
            notification = data["notifications"][0]

            required_fields = ["id", "receiver_id", "type", "title",
                               "message", "is_read", "created_at"]
            for field in required_fields:
                assert field in notification, f"Missing required field: {field}"

    def test_notification_is_read_is_boolean(self, client, mock_auth):
        """
        Verifies is_read field is always a boolean value.
        Frontend badge count logic depends on correct boolean type.
        """
        mock_result      = MagicMock()
        mock_result.data = SAMPLE_NOTIFICATIONS

        with patch("services.notification_service.supabase") as mock_db:
            mock_db.table.return_value\
                .select.return_value\
                .eq.return_value\
                .order.return_value\
                .execute.return_value = mock_result

            response = client.get(f"/api/notifications/{SAMPLE_EMPLOYEE_ID}")
            data     = json.loads(response.data)

            for notification in data["notifications"]:
                assert isinstance(notification["is_read"], bool), \
                    "is_read must be a boolean value"