"""
routes/notification_routes.py

HTTP endpoints for the Objective Cut-off Notification System.
All business logic lives in services/notification_service.py.

Endpoints:
  GET  /notifications/by-level        — fetch notifications visible to caller's level
  GET  /notifications/unread-count    — badge count for the sidebar bell
  GET  /notifications/cutoff-schedule — full timeline for the active cycle
  PATCH /notifications/<id>/read      — mark one notification read
  PATCH /notifications/mark-all-read  — mark all visible notifications read
  POST /notifications/fire-now        — manual trigger (HQ Admin only, for testing)
"""

from flask import Blueprint, request, jsonify
from datetime import date

from services.notification_service import (
    get_active_cycle,
    get_entries_for_level,
    build_trigger_key,
    fire_notification,
    seed_notifications_for_cycle,
    start_scheduler,
    init_notifications,
    CUTOFF_SCHEDULE,
)
from models.supabase_client import supabase

notifications_bp = Blueprint("notifications", __name__)


# ─────────────────────────────────────────────────────────────────────────────
# GET /notifications/by-level
# ─────────────────────────────────────────────────────────────────────────────

@notifications_bp.route("/notifications/by-level", methods=["GET"])
def get_notifications_by_level():
    """
    Returns all triggered notifications visible to the caller's level.
    Visibility rule: entry.level >= user_level OR entry.role == "all"
    Header: X-User-Level (1=HQ, 2=Country, 3=Branch, 4=Dept, 5=SubDept)
    """
    try:
        user_level = int(request.headers.get("X-User-Level", 99))

        cycle = get_active_cycle()
        if not cycle:
            return jsonify([]), 200

        pms_year        = cycle["pms_year"]
        visible_entries = get_entries_for_level(user_level)
        visible_keys    = [
            build_trigger_key(pms_year, e["mmdd"], e["role"])
            for e in visible_entries
        ]

        if not visible_keys:
            return jsonify([]), 200

        rows = (
            supabase.table("notifications")
            .select("*")
            .eq("type", "objective_cutoff")
            .eq("pms_cycle_id", cycle["id"])
            .in_("trigger_key", visible_keys)
            .order("created_at", desc=True)
            .execute()
            .data
        ) or []

        return jsonify(rows), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# GET /notifications/unread-count
# ─────────────────────────────────────────────────────────────────────────────

@notifications_bp.route("/notifications/unread-count", methods=["GET"])
def get_unread_count():
    """
    Returns count of unread notifications visible to the caller's level.
    Used for the sidebar bell badge.
    Header: X-User-Level
    """
    try:
        user_level = int(request.headers.get("X-User-Level", 99))

        cycle = get_active_cycle()
        if not cycle:
            return jsonify({"unread_count": 0}), 200

        pms_year        = cycle["pms_year"]
        visible_entries = get_entries_for_level(user_level)
        visible_keys    = [
            build_trigger_key(pms_year, e["mmdd"], e["role"])
            for e in visible_entries
        ]

        if not visible_keys:
            return jsonify({"unread_count": 0}), 200

        result = (
            supabase.table("notifications")
            .select("id")
            .eq("type", "objective_cutoff")
            .eq("pms_cycle_id", cycle["id"])
            .eq("is_read", False)
            .in_("trigger_key", visible_keys)
            .execute()
        )
        count = len(result.data or [])
        return jsonify({"unread_count": count}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# PATCH /notifications/<id>/read
# ─────────────────────────────────────────────────────────────────────────────

@notifications_bp.route("/notifications/<notif_id>/read", methods=["PATCH"])
def mark_notification_read(notif_id):
    """
    Marks a single notification as read.
    Because there is one row per schedule entry (not per user), this marks it
    read for all users at the same level — which is correct for a shared feed.
    """
    try:
        from datetime import timezone
        now = __import__("datetime").datetime.now(timezone.utc).isoformat()
        supabase.table("notifications").update({
            "is_read": True,
            "read_at": now,
        }).eq("id", notif_id).execute()
        return jsonify({"message": "Marked as read"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# PATCH /notifications/mark-all-read
# ─────────────────────────────────────────────────────────────────────────────

@notifications_bp.route("/notifications/mark-all-read", methods=["PATCH"])
def mark_all_read():
    """
    Marks all visible notifications as read for the caller's level.
    Header: X-User-Level
    """
    try:
        from datetime import timezone
        user_level = int(request.headers.get("X-User-Level", 99))

        cycle = get_active_cycle()
        if not cycle:
            return jsonify({"message": "No active cycle"}), 200

        pms_year        = cycle["pms_year"]
        visible_entries = get_entries_for_level(user_level)
        visible_keys    = [
            build_trigger_key(pms_year, e["mmdd"], e["role"])
            for e in visible_entries
        ]

        if not visible_keys:
            return jsonify({"message": "Nothing to mark"}), 200

        now = __import__("datetime").datetime.now(timezone.utc).isoformat()
        supabase.table("notifications").update({
            "is_read": True,
            "read_at": now,
        }).eq("type", "objective_cutoff").eq("pms_cycle_id", cycle["id"]).in_(
            "trigger_key", visible_keys
        ).execute()

        return jsonify({"message": "All marked as read"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# GET /notifications/cutoff-schedule
# ─────────────────────────────────────────────────────────────────────────────

@notifications_bp.route("/notifications/cutoff-schedule", methods=["GET"])
def get_cutoff_schedule():
    """
    Returns the full notification timeline for the active cycle split into
    triggered (already fired) and upcoming (not yet fired) entries.
    Header: X-User-Level
    """
    try:
        user_level = int(request.headers.get("X-User-Level", 99))
        cycle      = get_active_cycle()
        if not cycle:
            return jsonify({"schedule": [], "cycle": None}), 200

        pms_year        = cycle["pms_year"]
        today           = date.today().isoformat()
        visible_entries = get_entries_for_level(user_level)

        schedule_out = []
        for entry in visible_entries:
            trigger_date = f"{pms_year}-{entry['mmdd']}"
            days_until   = max(0, (date.fromisoformat(trigger_date) - date.today()).days)
            schedule_out.append({
                "trigger_date": trigger_date,
                "role":         entry["role"],
                "level":        entry["level"],
                "title":        entry["title"],
                "message":      entry["message"],
                "action_link":  entry["action_link"],
                "trigger_key":  build_trigger_key(pms_year, entry["mmdd"], entry["role"]),
                "is_triggered": today >= trigger_date,
                "days_until":   days_until,
            })

        return jsonify({
            "schedule": schedule_out,
            "cycle": {
                "id":                    cycle["id"],
                "pms_year":              pms_year,
                "objective_setting_end": cycle.get("objective_setting_end"),
                "grace_period_end":      cycle.get("grace_period_end"),
            },
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# POST /notifications/fire-now  (HQ Admin manual trigger — for testing)
# ─────────────────────────────────────────────────────────────────────────────

@notifications_bp.route("/notifications/fire-now", methods=["POST"])
def fire_notification_now():
    """
    Manually fires one or all schedule entries for the active cycle.
    Body (optional): { "trigger_key": "2026-08-25:hq_admin" }
    Header: X-User-Level: 1  (HQ Admin only)
    """
    try:
        user_level = int(request.headers.get("X-User-Level", 99))
        if user_level > 1:
            return jsonify({"error": "Only HQ Admin can manually trigger notifications"}), 403

        data       = request.get_json() or {}
        target_key = data.get("trigger_key", "").strip()
        cycle      = get_active_cycle()
        if not cycle:
            return jsonify({"error": "No active cycle"}), 404

        pms_year = cycle["pms_year"]
        fired    = 0
        for entry in CUTOFF_SCHEDULE:
            key = build_trigger_key(pms_year, entry["mmdd"], entry["role"])
            if target_key and key != target_key:
                continue
            if fire_notification(cycle, entry):
                fired += 1

        return jsonify({"message": f"Fired {fired} notification(s)"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400
