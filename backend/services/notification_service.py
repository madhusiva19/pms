"""Notification business logic."""

from datetime import datetime, timedelta

from flask import current_app, jsonify, request

from .common import *


def create_notification(notification_type, title, description, related_evaluation_id=None):
    """Create a notification for workflow activity.

    The app first tries Supabase. If Supabase is unavailable, it stores the
    notification in the in-memory fallback list so the Notifications page still
    shows the event during the current backend session.
    """

    created_at = f"{datetime.utcnow().isoformat()}Z"

    # Supabase stores notification fields with database naming. The normalizer
    # later converts this into the frontend NotificationItem shape.
    payload = {
        "notification_type": notification_type,
        "title": title,
        "description": description,
        "related_evaluation_id": related_evaluation_id,
        "is_read": False,
        "created_at": created_at,
    }

    if USE_SUPABASE:
        try:
            rows = supabase_request("notifications", method="POST", payload=payload)
            if rows:
                return normalize_notification(rows[0])
        except Exception as error:
            current_app.logger.info("Could not create Supabase notification: %s", error)

    # If Supabase rejects the insert or is unavailable, keep the notification in
    # memory so the current development session still reflects workflow changes.
    fallback_notification = {
        "id": str(len(notifications) + 1),
        "type": notification_type,
        "title": title,
        "description": description,
        "timestamp": created_at,
        "is_read": False,
        "related_evaluation_id": related_evaluation_id,
    }
    notifications.insert(0, fallback_notification)
    return fallback_notification

def get_notifications():
    """Return workflow notifications ordered newest first."""

    if USE_SUPABASE:
        try:
            rows = supabase_request("notifications", params={"select": "*", "order": "created_at.desc", "limit": 50})
            db_notifications = [normalize_notification(row) for row in rows]
            fallback_ids = {str(notification.get("id")) for notification in notifications}
            # Merge DB rows with in-memory fallback notifications created during
            # this process lifetime.
            merged_notifications = notifications + [
                notification
                for notification in db_notifications
                if str(notification.get("id")) not in fallback_ids
            ]
            return jsonify(merged_notifications), 200
        except Exception as error:
            current_app.logger.warning("Falling back to in-memory notifications: %s", error)

    return fallback_response(notifications)


def add_notification():
    """Create a notification from frontend or backend workflow actions."""

    data = request.get_json(silent=True) or {}
    notification = create_notification(
        data.get("type") or data.get("notification_type") or "general",
        data.get("title") or "New Notification",
        data.get("description") or data.get("message") or "",
        data.get("related_evaluation_id"),
    )
    return jsonify(notification), 201


def mark_notification_read(notification_id):
    """Mark one notification as read."""

    if USE_SUPABASE:
        # The real table may use notification_id, while fallback rows use id.
        # Try both so the endpoint works across schema versions.
        for column in ("notification_id", "id"):
            try:
                rows = supabase_request(
                    "notifications",
                    method="PATCH",
                    params={column: f"eq.{notification_id}"},
                    payload={"is_read": True},
                )
                if rows:
                    return jsonify(normalize_notification(rows[0])), 200
            except Exception as error:
                current_app.logger.info("Could not update notification using %s: %s", column, error)

    # Fall through to in-memory store when Supabase has no matching row
    # (notifications created via the fallback path during this session).
    for notification in notifications:
        if str(notification.get("id")) == str(notification_id):
            notification["is_read"] = True
            return jsonify(notification), 200
    return jsonify({"error": "Notification not found"}), 404
# Employees use this endpoint to request a re-evaluation from a superior. The
# route validates required complaint fields and creates a notification.
