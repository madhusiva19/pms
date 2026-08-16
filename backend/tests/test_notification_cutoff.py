"""
tests/test_notification_cutoff.py
----------------------------------
Covers the Objective Cut-off Notification System routes (notifications_bp)
and the manual-rating broadcast/reminder routes that test_notification.py
and test_routes.py don't already exercise: by-level, unread-count,
grace-status, cutoff-schedule, refresh-cycle, fire-now, evaluation
notifications, and manual-rating send-reminder/broadcast.
"""

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


SAMPLE_CYCLE = {
    "id": "cycle-1", "pms_year": 2026, "is_active": True,
    "objective_setting_end": "2026-08-19", "grace_period_end": "2026-08-22",
}


# ── GET /api/notifications/by-level ─────────────────────────────────────────

@patch("routes.notification_routes._verified_user_level")
@patch("routes.notification_routes.supabase")
@patch("routes.notification_routes.get_active_cycle")
def test_get_notifications_by_level_success(mock_get_cycle, mock_supabase, mock_level, client, mock_auth):
    mock_get_cycle.return_value = SAMPLE_CYCLE
    mock_level.return_value = 1
    mock_supabase.table.return_value.select.return_value.eq.return_value\
        .eq.return_value.order.return_value.execute.return_value.data = [
            {"id": "n1", "trigger_key": "2026-08-06:hq_admin:obj_end_warning"},
        ]

    res = client.get("/api/notifications/by-level")
    assert res.status_code == 200


@patch("routes.notification_routes.supabase")
@patch("routes.notification_routes.get_active_cycle")
def test_get_notifications_by_level_no_active_cycle(mock_get_cycle, mock_supabase, client, mock_auth):
    mock_get_cycle.return_value = None
    mock_supabase.table.return_value.select.return_value.eq.return_value\
        .execute.return_value.data = []
    res = client.get("/api/notifications/by-level")
    assert res.status_code == 200
    assert res.get_json() == []


def test_get_notifications_by_level_unauthenticated(client, mock_auth):
    mock_auth.require_auth.return_value = None
    res = client.get("/api/notifications/by-level")
    assert res.status_code == 401


# ── GET /api/notifications/unread-count ─────────────────────────────────────

@patch("routes.notification_routes._verified_user_level")
@patch("routes.notification_routes.supabase")
@patch("routes.notification_routes.get_active_cycle")
def test_get_unread_count_success(mock_get_cycle, mock_supabase, mock_level, client, mock_auth):
    mock_get_cycle.return_value = SAMPLE_CYCLE
    mock_level.return_value = 1
    mock_supabase.table.return_value.select.return_value.eq.return_value\
        .eq.return_value.eq.return_value.execute.return_value.data = [
            {"id": "n1", "trigger_key": "2026-08-06:hq_admin:x", "is_read": False},
        ]

    res = client.get("/api/notifications/unread-count")
    assert res.status_code == 200
    assert "unread_count" in res.get_json()


def test_get_unread_count_unauthenticated(client, mock_auth):
    mock_auth.require_auth.return_value = None
    res = client.get("/api/notifications/unread-count")
    assert res.status_code == 401


# ── GET /api/notifications/grace-status ─────────────────────────────────────

@patch("routes.notification_routes.get_grace_period_status")
@patch("routes.notification_routes.get_active_cycle")
@patch("routes.notification_routes._verified_user_level")
def test_get_grace_status_hq_admin_active(mock_level, mock_get_cycle, mock_grace, client, mock_auth):
    mock_level.return_value = 1
    mock_get_cycle.return_value = SAMPLE_CYCLE
    mock_grace.return_value = {"status": "active", "message": "x", "grace_end": "2026-08-22", "days_left": 6}

    res = client.get("/api/notifications/grace-status")
    assert res.status_code == 200
    assert res.get_json()["status"] == "active"


@patch("routes.notification_routes._verified_user_level")
def test_get_grace_status_non_hq_admin_gets_none(mock_level, client, mock_auth):
    """Non-HQ callers always get status: none, regardless of grace period state."""
    mock_level.return_value = 3
    res = client.get("/api/notifications/grace-status")
    assert res.status_code == 200
    assert res.get_json()["status"] == "none"


def test_get_grace_status_unauthenticated(client, mock_auth):
    mock_auth.require_auth.return_value = None
    res = client.get("/api/notifications/grace-status")
    assert res.status_code == 401


# ── GET /api/notifications/cutoff-schedule ──────────────────────────────────

@patch("routes.notification_routes.get_entries_for_level")
@patch("routes.notification_routes.get_active_cycle")
@patch("routes.notification_routes._verified_user_level")
def test_get_cutoff_schedule_success(mock_level, mock_get_cycle, mock_entries, client, mock_auth):
    mock_level.return_value = 1
    mock_get_cycle.return_value = SAMPLE_CYCLE
    mock_entries.return_value = [{
        "trigger_date": "2026-08-19", "trigger_key": "2026-08-19:hq_admin:x",
        "role": "hq_admin", "level": 1, "event_type": "warning",
        "title": "t", "message": "m", "action_link": "/x",
    }]

    res = client.get("/api/notifications/cutoff-schedule")
    data = res.get_json()
    assert res.status_code == 200
    assert data["cycle"]["pms_year"] == 2026
    assert len(data["schedule"]) == 1


@patch("routes.notification_routes.supabase")
@patch("routes.notification_routes.get_active_cycle")
def test_get_cutoff_schedule_no_active_cycle(mock_get_cycle, mock_supabase, client, mock_auth):
    mock_get_cycle.return_value = None
    mock_supabase.table.return_value.select.return_value.eq.return_value\
        .execute.return_value.data = []
    res = client.get("/api/notifications/cutoff-schedule")
    assert res.status_code == 200
    assert res.get_json()["schedule"] == []


def test_get_cutoff_schedule_unauthenticated(client, mock_auth):
    mock_auth.require_auth.return_value = None
    res = client.get("/api/notifications/cutoff-schedule")
    assert res.status_code == 401


# ── POST /api/notifications/refresh-cycle (HQ Admin only) ──────────────────

@patch("routes.notification_routes.refresh_notifications_for_cycle")
@patch("routes.notification_routes.get_active_cycle")
@patch("routes.notification_routes._verified_user_level")
def test_refresh_cycle_success_for_hq_admin(mock_level, mock_get_cycle, mock_refresh, client, mock_auth):
    mock_level.return_value = 1
    mock_get_cycle.return_value = SAMPLE_CYCLE

    res = client.post("/api/notifications/refresh-cycle")
    assert res.status_code == 200
    mock_refresh.assert_called_once_with(SAMPLE_CYCLE)


@patch("routes.notification_routes._verified_user_level")
def test_refresh_cycle_forbidden_for_non_hq_admin(mock_level, client, mock_auth):
    """The level now comes from a verified DB lookup, not a spoofable header."""
    mock_level.return_value = 3
    res = client.post("/api/notifications/refresh-cycle")
    assert res.status_code == 403


def test_refresh_cycle_unauthenticated(client, mock_auth):
    mock_auth.require_auth.return_value = None
    res = client.post("/api/notifications/refresh-cycle")
    assert res.status_code == 401


# ── POST /api/notifications/fire-now (HQ Admin only) ────────────────────────

@patch("routes.notification_routes.fire_notification")
@patch("routes.notification_routes.get_schedule_for_cycle")
@patch("routes.notification_routes.get_active_cycle")
@patch("routes.notification_routes._verified_user_level")
def test_fire_now_success_for_hq_admin(mock_level, mock_get_cycle, mock_schedule, mock_fire, client, mock_auth):
    mock_level.return_value = 1
    mock_get_cycle.return_value = SAMPLE_CYCLE
    mock_schedule.return_value = [{"trigger_key": "2026-08-19:hq_admin:x"}]
    mock_fire.return_value = True

    res = client.post("/api/notifications/fire-now", json={})
    assert res.status_code == 200
    assert "Fired 1" in res.get_json()["message"]


@patch("routes.notification_routes._verified_user_level")
def test_fire_now_forbidden_for_non_hq_admin(mock_level, client, mock_auth):
    mock_level.return_value = 2
    res = client.post("/api/notifications/fire-now", json={})
    assert res.status_code == 403


# ── GET/PATCH /api/evaluation-notifications ─────────────────────────────────

@patch("routes.notification_routes.supabase")
def test_get_evaluation_notifications_success(mock_supabase, client, mock_auth):
    mock_supabase.table.return_value.select.return_value.order.return_value\
        .limit.return_value.execute.return_value.data = [{"id": "e1"}]

    res = client.get("/api/evaluation-notifications")
    assert res.status_code == 200
    assert isinstance(res.get_json(), list)


def test_get_evaluation_notifications_unauthenticated(client, mock_auth):
    mock_auth.require_auth.return_value = None
    res = client.get("/api/evaluation-notifications")
    assert res.status_code == 401


@patch("routes.notification_routes.supabase")
def test_mark_evaluation_notification_read_success(mock_supabase, client, mock_auth):
    res = client.patch("/api/evaluation-notifications/e1/read")
    assert res.status_code == 200


def test_mark_evaluation_notification_read_unauthenticated(client, mock_auth):
    mock_auth.require_auth.return_value = None
    res = client.patch("/api/evaluation-notifications/e1/read")
    assert res.status_code == 401


# ── POST /api/manual-rating-notifications/send-reminder ────────────────────

@patch("routes.notification_routes.supabase")
def test_send_manual_rating_reminder_success(mock_supabase, client, mock_auth):
    with patch("services.notification_service.supabase") as service_sb:
        service_sb.table.return_value.select.return_value.eq.return_value\
            .single.return_value.execute.return_value.data = {
                "id": "recipient-1", "full_name": "Jane", "manager_id": DEFAULT_CALLER_ID,
            }

        res = client.post("/api/manual-rating-notifications/send-reminder", json={
            "sender_id": DEFAULT_CALLER_ID, "recipient_id": "recipient-1",
            "period": "H1", "pms_year": 2026,
        })
        assert res.status_code == 200
        assert res.get_json()["success"] is True


def test_send_manual_rating_reminder_missing_fields(client, mock_auth):
    res = client.post("/api/manual-rating-notifications/send-reminder", json={
        "sender_id": DEFAULT_CALLER_ID,
    })
    assert res.status_code == 400


def test_send_manual_rating_reminder_sender_id_spoofed(client, mock_auth):
    """sender_id in the body must match the authenticated caller."""
    res = client.post("/api/manual-rating-notifications/send-reminder", json={
        "sender_id": "someone-else", "recipient_id": "recipient-1",
        "period": "H1", "pms_year": 2026,
    })
    assert res.status_code == 403


def test_send_manual_rating_reminder_unauthenticated(client, mock_auth):
    mock_auth.require_auth.return_value = None
    res = client.post("/api/manual-rating-notifications/send-reminder", json={
        "sender_id": "x", "recipient_id": "y", "period": "H1", "pms_year": 2026,
    })
    assert res.status_code == 401


# ── POST /api/manual-rating-notifications/broadcast (HQ Admin only) ────────

@patch("services.notification_service.broadcast_notifications")
@patch("routes.notification_routes.supabase")
@patch("routes.notification_routes._verified_user_level")
def test_broadcast_success_for_hq_admin(mock_level, mock_supabase, mock_broadcast, client, mock_auth):
    mock_level.return_value = 1
    mock_supabase.table.return_value.select.return_value.eq.return_value\
        .eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
    mock_broadcast.return_value = 42

    res = client.post("/api/manual-rating-notifications/broadcast", json={
        "type": "period_opened", "period": "H1", "pms_year": 2026,
    })
    assert res.status_code == 200
    assert res.get_json()["notifications_sent"] == 42


@patch("routes.notification_routes._verified_user_level")
def test_broadcast_forbidden_for_non_hq_admin(mock_level, client, mock_auth):
    mock_level.return_value = 4
    res = client.post("/api/manual-rating-notifications/broadcast", json={
        "type": "period_opened", "period": "H1", "pms_year": 2026,
    })
    assert res.status_code == 403


def test_broadcast_missing_fields(client, mock_auth):
    with patch("routes.notification_routes._verified_user_level", return_value=1):
        res = client.post("/api/manual-rating-notifications/broadcast", json={"type": "period_opened"})
        assert res.status_code == 400


def test_broadcast_unauthenticated(client, mock_auth):
    mock_auth.require_auth.return_value = None
    res = client.post("/api/manual-rating-notifications/broadcast", json={
        "type": "period_opened", "period": "H1", "pms_year": 2026,
    })
    assert res.status_code == 401
