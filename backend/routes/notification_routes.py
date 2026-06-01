"""
routes/notification_routes.py

HTTP endpoints for the Objective Cut-off Notification System.

Endpoints:
  GET   /notifications/by-level          — notifications visible to caller's level
  GET   /notifications/unread-count      — badge count
  GET   /notifications/cutoff-schedule   — full timeline for active cycle
  GET   /notifications/grace-status      — grace period banner data (HQ only)
  PATCH /notifications/<id>/read         — mark one read
  PATCH /notifications/mark-all-read     — mark all visible read
  POST  /notifications/refresh-cycle     — purge + reseed after date change (HQ only)
  POST  /notifications/fire-now          — manual trigger for testing (HQ only)

TRIGGER KEY FORMAT
──────────────────
  "YYYY-MM-DD:role:slug"
  e.g. "2026-08-06:hq_admin:obj_end_warning"
       "2026-08-16:all:obj_end"
       "2026-08-19:hq_admin:grace_warning"
       "2026-08-22:hq_admin:grace_ended"

Role filtering is always done IN-MEMORY after fetching all rows for the cycle,
never via trigger_key in the DB query — so date changes that produce new keys
never hide old notifications.
"""

from flask import Blueprint, request, jsonify
from datetime import date

from services.notification_service import (
    get_active_cycle,
    get_entries_for_level,
    get_schedule_for_cycle,
    get_grace_period_status,
    build_trigger_key,
    fire_notification,
    purge_cycle_notifications,
    refresh_notifications_for_cycle,
    seed_notifications_for_cycle,
    start_scheduler,
    init_notifications,
)
from models.supabase_client import supabase

notifications_bp = Blueprint("notifications", __name__)


# ─────────────────────────────────────────────────────────────────────────────
# INTERNAL HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _visible_roles_for_level(user_level: int, cycle: dict) -> set[str]:
    """
    Returns the set of roles visible to this user level.
    e.g. level 1 (HQ)      → {"hq_admin", "all"}
         level 2 (Country)  → {"country_admin", "all"}
    """
    entries = get_entries_for_level(user_level, cycle)
    return {e["role"] for e in entries}


def _filter_by_role(rows: list, visible_roles: set[str]) -> list:
    """
    Filters DB notification rows by role segment of trigger_key.
    trigger_key format: "YYYY-MM-DD:role:slug"
    Falls back to "all" for malformed keys.
    """
    result = []
    for row in rows:
        key   = row.get("trigger_key") or ""
        parts = key.split(":")
        # key = "YYYY-MM-DD:role:slug" → parts[1] is role
        role  = parts[1] if len(parts) >= 3 else ("all" if len(parts) < 2 else parts[-1])
        if role in visible_roles:
            result.append(row)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# GET /notifications/by-level
# ─────────────────────────────────────────────────────────────────────────────

@notifications_bp.route("/notifications/by-level", methods=["GET"])
def get_notifications_by_level():
    """
    Returns fired notifications visible to the caller's level.
    Only returns notifications whose trigger_date <= today (already due).
    Header: X-User-Level
    """
    try:
        user_level = int(request.headers.get("X-User-Level", 99))

        cycle = get_active_cycle()
        if not cycle:
            return jsonify([]), 200

        rows = (
            supabase.table("notifications")
            .select("*")
            .eq("type", "objective_cutoff")
            .eq("pms_cycle_id", cycle["id"])
            .order("created_at", desc=True)
            .execute()
            .data
        ) or []

        visible_roles = _visible_roles_for_level(user_level, cycle)
        rows = _filter_by_role(rows, visible_roles)

        return jsonify(rows), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# GET /notifications/unread-count
# ─────────────────────────────────────────────────────────────────────────────

@notifications_bp.route("/notifications/unread-count", methods=["GET"])
def get_unread_count():
    """
    Badge count of unread notifications visible to the caller's level.
    Header: X-User-Level
    """
    try:
        user_level = int(request.headers.get("X-User-Level", 99))

        cycle = get_active_cycle()
        if not cycle:
            return jsonify({"unread_count": 0}), 200

        rows = (
            supabase.table("notifications")
            .select("id, trigger_key, is_read")
            .eq("type", "objective_cutoff")
            .eq("pms_cycle_id", cycle["id"])
            .eq("is_read", False)
            .execute()
            .data
        ) or []

        visible_roles = _visible_roles_for_level(user_level, cycle)
        filtered      = _filter_by_role(rows, visible_roles)

        return jsonify({"unread_count": len(filtered)}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# GET /notifications/grace-status
# ─────────────────────────────────────────────────────────────────────────────

@notifications_bp.route("/notifications/grace-status", methods=["GET"])
def get_grace_status():
    """
    Returns grace period banner data for HQ Admin.
    Response when active:
      { status: "active", message: "...", grace_end: "YYYY-MM-DD", days_left: N }
    Response when ended:
      { status: "ended",  message: "...", grace_end: "YYYY-MM-DD", days_left: 0 }
    Response when not in grace period:
      { status: "none" }

    Header: X-User-Level (only meaningful for level 1 — HQ Admin)
    """
    try:
        user_level = int(request.headers.get("X-User-Level", 99))
        if user_level != 1:
            return jsonify({"status": "none"}), 200

        cycle = get_active_cycle()
        if not cycle:
            return jsonify({"status": "none"}), 200

        status = get_grace_period_status(cycle)
        if not status:
            return jsonify({"status": "none"}), 200

        return jsonify(status), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# PATCH /notifications/<id>/read
# ─────────────────────────────────────────────────────────────────────────────

@notifications_bp.route("/notifications/<notif_id>/read", methods=["PATCH"])
def mark_notification_read(notif_id):
    """Marks a single notification as read."""
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
    Marks all unread notifications visible to the caller as read.
    Header: X-User-Level
    """
    try:
        from datetime import timezone
        user_level = int(request.headers.get("X-User-Level", 99))

        cycle = get_active_cycle()
        if not cycle:
            return jsonify({"message": "No active cycle"}), 200

        rows = (
            supabase.table("notifications")
            .select("id, trigger_key")
            .eq("type", "objective_cutoff")
            .eq("pms_cycle_id", cycle["id"])
            .eq("is_read", False)
            .execute()
            .data
        ) or []

        visible_roles = _visible_roles_for_level(user_level, cycle)
        visible_rows  = _filter_by_role(rows, visible_roles)

        if not visible_rows:
            return jsonify({"message": "Nothing to mark"}), 200

        ids_to_mark = [r["id"] for r in visible_rows]
        now = __import__("datetime").datetime.now(timezone.utc).isoformat()

        supabase.table("notifications").update({
            "is_read": True,
            "read_at": now,
        }).in_("id", ids_to_mark).execute()

        return jsonify({"message": f"{len(ids_to_mark)} notification(s) marked as read"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# GET /notifications/cutoff-schedule
# ─────────────────────────────────────────────────────────────────────────────

@notifications_bp.route("/notifications/cutoff-schedule", methods=["GET"])
def get_cutoff_schedule():
    """
    Returns the full notification timeline for the active cycle.
    Each entry shows whether it has fired and how many days until it fires.
    Header: X-User-Level
    """
    try:
        user_level      = int(request.headers.get("X-User-Level", 99))
        cycle           = get_active_cycle()
        if not cycle:
            return jsonify({"schedule": [], "cycle": None}), 200

        today           = date.today().isoformat()
        visible_entries = get_entries_for_level(user_level, cycle)

        schedule_out = []
        for entry in visible_entries:
            trigger_date = entry["trigger_date"]
            days_until   = max(0, (date.fromisoformat(trigger_date) - date.today()).days)
            schedule_out.append({
                "trigger_date": trigger_date,
                "trigger_key":  entry["trigger_key"],
                "role":         entry["role"],
                "level":        entry["level"],
                "event_type":   entry["event_type"],
                "title":        entry["title"],
                "message":      entry["message"],
                "action_link":  entry["action_link"],
                "is_triggered": today >= trigger_date,
                "days_until":   days_until,
            })

        # Sort by trigger_date ascending so timeline reads chronologically
        schedule_out.sort(key=lambda x: x["trigger_date"])

        return jsonify({
            "schedule": schedule_out,
            "cycle": {
                "id":                    cycle["id"],
                "pms_year":              cycle["pms_year"],
                "objective_setting_end": cycle.get("objective_setting_end"),
                "grace_period_end":      cycle.get("grace_period_end"),
            },
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# POST /notifications/refresh-cycle  (HQ Admin — call after updating cycle dates)
# ─────────────────────────────────────────────────────────────────────────────

@notifications_bp.route("/notifications/refresh-cycle", methods=["POST"])
def refresh_cycle_notifications():
    """
    Called by the frontend immediately after HQ Admin saves updated cycle dates.
    Deletes ALL notifications for the current active cycle and re-seeds them
    with the new dates. Previous cycle notifications are never affected.

    Header: X-User-Level: 1  (HQ Admin only)
    """
    try:
        user_level = int(request.headers.get("X-User-Level", 99))
        if user_level != 1:
            return jsonify({"error": "Only HQ Admin can refresh cycle notifications"}), 403

        cycle = get_active_cycle()
        if not cycle:
            return jsonify({"error": "No active cycle"}), 404

        refresh_notifications_for_cycle(cycle)

        return jsonify({
            "message": f"Notifications refreshed for cycle {cycle['pms_year']}",
            "cycle_id": cycle["id"],
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# POST /notifications/fire-now  (HQ Admin — for testing)
# ─────────────────────────────────────────────────────────────────────────────

@notifications_bp.route("/notifications/fire-now", methods=["POST"])
def fire_notification_now():
    """
    Manually fires one or all schedule entries for the active cycle.
    Body (optional): { "trigger_key": "2026-08-16:all:obj_end" }
    If omitted, fires ALL entries regardless of date.
    Header: X-User-Level: 1
    """
    try:
        user_level = int(request.headers.get("X-User-Level", 99))
        if user_level != 1:
            return jsonify({"error": "Only HQ Admin can manually trigger notifications"}), 403

        data       = request.get_json() or {}
        target_key = data.get("trigger_key", "").strip()
        cycle      = get_active_cycle()
        if not cycle:
            return jsonify({"error": "No active cycle"}), 404

        fired = 0
        for entry in get_schedule_for_cycle(cycle):
            if target_key and entry["trigger_key"] != target_key:
                continue
            if fire_notification(cycle, entry):
                fired += 1

        return jsonify({"message": f"Fired {fired} notification(s)"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400

