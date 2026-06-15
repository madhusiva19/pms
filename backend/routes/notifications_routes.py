"""
routes/notifications.py
------------------------
Flask Blueprint for manual-rating notification endpoints.

Endpoints
---------
GET    /api/manual-rating-notifications/<user_id>          List user's notifications
PATCH  /api/manual-rating-notifications/<id>/read          Mark one as read
DELETE /api/manual-rating-notifications/<id>               Delete one notification
POST   /api/manual-rating-notifications/send-reminder      Manager → direct report reminder
POST   /api/manual-rating-notifications/broadcast          System broadcast by type
"""

from flask import Blueprint, jsonify, request

from services.notification_service import broadcast_notifications, send_reminder
from utils.db import supabase

notifications_bp = Blueprint("manual_notifications", __name__)


# ---------------------------------------------------------------------------
# Fetch notifications for a user
# ---------------------------------------------------------------------------

@notifications_bp.route(
    "/api/manual-rating-notifications/<user_id>",
    methods=["GET"],
)
def get_manual_rating_notifications(user_id: str):
    """
    Return all notifications addressed to a user, newest first.

    Used by the Notifications page to populate all four tabs.
    """
    try:
        result = (
            supabase.table("manual_rating_notifications")
            .select("*")
            .eq("recipient_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return jsonify(result.data or [])

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ---------------------------------------------------------------------------
# Mark a notification as read
# ---------------------------------------------------------------------------

@notifications_bp.route(
    "/api/manual-rating-notifications/<notif_id>/read",
    methods=["PATCH"],
)
def mark_notification_read(notif_id: str):
    """Flip ``is_read`` to True for the given notification id."""
    try:
        (
            supabase.table("manual_rating_notifications")
            .update({"is_read": True})
            .eq("id", notif_id)
            .execute()
        )
        return jsonify({"success": True})

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ---------------------------------------------------------------------------
# Delete a notification
# ---------------------------------------------------------------------------

@notifications_bp.route(
    "/api/manual-rating-notifications/<notif_id>",
    methods=["DELETE"],
)
def delete_notification(notif_id: str):
    """
    Delete a notification row.

    Accepts an optional ``recipient_id`` query param as an extra ownership
    check so users can only delete their own notifications.
    """
    try:
        recipient_id = request.args.get("recipient_id")

        query = (
            supabase.table("manual_rating_notifications")
            .delete()
            .eq("id", notif_id)
        )

        if recipient_id:
            query = query.eq("recipient_id", recipient_id)

        query.execute()
        return jsonify({"success": True})

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ---------------------------------------------------------------------------
# Send a one-to-one reminder
# ---------------------------------------------------------------------------

@notifications_bp.route(
    "/api/manual-rating-notifications/send-reminder",
    methods=["POST"],
)
def send_manual_rating_reminder():
    """
    Allow a manager to send a personalised reminder to one of their direct
    reports.

    The service layer validates that the sender is the recipient's manager
    before inserting the notification.
    """
    try:
        body         = request.get_json()
        sender_id    = body.get("sender_id")
        recipient_id = body.get("recipient_id")
        period       = body.get("period")
        pms_year     = body.get("pms_year")
        message      = body.get("message", "")

        if not all([sender_id, recipient_id, period, pms_year]):
            return jsonify({"error": "Missing required fields"}), 400

        result = send_reminder(
            sender_id    = sender_id,
            recipient_id = recipient_id,
            period       = period,
            pms_year     = pms_year,
            message      = message,
        )
        return jsonify(result)

    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 403

    except ValueError as exc:
        return jsonify({"error": str(exc)}), 404

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ---------------------------------------------------------------------------
# System broadcast
# ---------------------------------------------------------------------------

@notifications_bp.route(
    "/api/manual-rating-notifications/broadcast",
    methods=["POST"],
)
def broadcast_manual_rating_notification():
    """
    Trigger a system-wide broadcast notification.

    Supported types
    ---------------
    ``period_opened``    Sent once when the rating window opens.
    ``deadline_warning`` Sent 3 days before the deadline closes.
    ``period_closed``    Sent when the window closes with outstanding ratings.

    Guards against duplicate ``period_opened`` broadcasts — if one has already
    been sent for the period, this returns 200 with ``success: False``.
    """
    try:
        body       = request.get_json()
        notif_type = body.get("type")
        period     = body.get("period")
        pms_year   = body.get("pms_year")

        if not all([notif_type, period, pms_year]):
            return jsonify({"error": "Missing required fields"}), 400

        # Prevent duplicate period_opened broadcasts
        if notif_type == "period_opened":
            existing = (
                supabase.table("manual_rating_notifications")
                .select("id")
                .eq("type", "period_opened")
                .eq("period", period)
                .eq("pms_year", pms_year)
                .limit(1)
                .execute()
            )

            if existing.data:
                return jsonify({
                    "success":            False,
                    "message": (
                        f"period_opened notification already sent for {period} {pms_year}. "
                        "No duplicates created."
                    ),
                    "notifications_sent": 0,
                }), 200

        count = broadcast_notifications(notif_type, period, pms_year)

        return jsonify({"success": True, "notifications_sent": count})

    except Exception as exc:
        print(f"[ERROR] broadcast_manual_rating_notification: {exc}")
        return jsonify({"error": str(exc)}), 500
