# notification_routes.py

from flask import Blueprint, jsonify, request
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from datetime import datetime, date, timedelta
import uuid

notifications_bp = Blueprint("notifications", __name__)

# Injected by init_notifications()
_supabase = None


def init_notifications(supabase_client):
    global _supabase
    _supabase = supabase_client


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def get_active_cycle():
    """Fetch the active PMS cycle from DB. Returns None if not found."""
    try:
        result = (
            _supabase.table("pms_cycles")
            .select("*")
            .eq("is_active", True)
            .order("pms_year", desc=True)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None
    except Exception as e:
        print(f"❌ get_active_cycle failed: {e}")
        return None


def get_users_by_org_level(org_level: int) -> list:
    """Returns all active users matching the given org_level."""
    try:
        result = (
            _supabase.table("users")
            .select("id, full_name, org_level")
            .eq("org_level", org_level)
            .eq("is_active", True)
            .execute()
        )
        return result.data or []
    except Exception as e:
        print(f"❌ get_users_by_org_level({org_level}) failed: {e}")
        return []


def get_all_active_users() -> list:
    """Returns all active users regardless of level."""
    try:
        result = (
            _supabase.table("users")
            .select("id, full_name, org_level")
            .eq("is_active", True)
            .execute()
        )
        return result.data or []
    except Exception as e:
        print(f"❌ get_all_active_users failed: {e}")
        return []


def notification_already_sent(notification_type: str, cycle_id: int) -> bool:
    """
    Prevents duplicate notifications. Checks if a notification of this type
    was already triggered for this PMS cycle.
    We encode cycle_id in triggered_by field as: "scheduler:{type}:cycle:{id}"
    """
    trigger_key = f"scheduler:{notification_type}:cycle:{cycle_id}"
    try:
        result = (
            _supabase.table("notifications")
            .select("id")
            .eq("triggered_by", trigger_key)
            .limit(1)
            .execute()
        )
        return bool(result.data)
    except Exception as e:
        print(f"❌ notification_already_sent check failed: {e}")
        return False


def insert_notifications(
    user_ids: list,
    notification_type: str,
    title: str,
    message: str,
    action_link: str,
    cycle_id: int,
) -> None:
    """
    Inserts one notification row per user_id.
    Skips insert if already sent for this cycle (idempotent).
    """
    if not user_ids:
        print(f"⚠️  insert_notifications: no users to notify for type={notification_type}")
        return

    if notification_already_sent(notification_type, cycle_id):
        print(f"ℹ️  Notification '{notification_type}' already sent for cycle {cycle_id} — skipping.")
        return

    trigger_key = f"scheduler:{notification_type}:cycle:{cycle_id}"
    rows = [
        {
            "id":           str(uuid.uuid4()),
            "receiver_id":  str(uid),
            "type":         notification_type,
            "title":        title,
            "message":      message,
            "is_read":      False,
            "triggered_by": trigger_key,
            "action_link":  action_link,
            "created_at":   datetime.utcnow().isoformat(),
        }
        for uid in user_ids
    ]

    try:
        _supabase.table("notifications").insert(rows).execute()
        print(f"✅ Inserted {len(rows)} notifications for type='{notification_type}' cycle={cycle_id}")
    except Exception as e:
        print(f"❌ insert_notifications failed: {e}")


def format_date_display(d) -> str:
    """Converts a date/string to '31 Aug 2025' format for notification messages."""
    if isinstance(d, str):
        d = datetime.fromisoformat(d).date()
    return d.strftime("%-d %b %Y")   # Use "%#d %b %Y" on Windows


# ─────────────────────────────────────────────────────────────────────────────
# CORE SCHEDULER JOB — runs daily at 08:00
# ─────────────────────────────────────────────────────────────────────────────

def check_and_send_notifications():
    """
    Runs once per day. Reads the active PMS cycle dates dynamically,
    computes which notifications are due today, and inserts them.
    
    Notification schedule (all dates derived from the active cycle):
      objective_setting_start  → All Users        (window open)
      start + 30 days          → Sub Dept Admin   (level 5 reminder)
      start + 35 days          → Dept Admin       (level 4 alert)
      start + 40 days          → Branch Admin     (level 3 escalation)
      start + 45 days          → Country Admin    (level 2 escalation)
      start + 55 days          → HQ Admin         (level 1 final escalation)
      objective_setting_end    → All Users        (window closed)
      grace_period_end         → HQ Admin         (grace ended / fully frozen)
    """
    print(f"🔔 Running notification check at {datetime.utcnow().isoformat()}")

    cycle = get_active_cycle()
    if not cycle:
        print("⚠️  No active PMS cycle found — skipping notification check.")
        return

    cycle_id = cycle["id"]
    today    = date.today()

    # ── Parse cycle dates ────────────────────────────────────────────────────
    try:
        obj_start = (
            datetime.fromisoformat(cycle["objective_setting_start"]).date()
            if cycle.get("objective_setting_start")
            else datetime.fromisoformat(cycle["pms_start"]).date()
        )
        obj_end = datetime.fromisoformat(cycle["objective_setting_end"]).date()
        grace_end = datetime.fromisoformat(cycle["grace_period_end"]).date()
    except Exception as e:
        print(f"❌ Failed to parse cycle dates: {e}")
        return

    # We derive cascade dates as offsets from obj_start so they scale
    # automatically when HQ Admin edits the cycle dates.
    cycle_duration_days = (obj_end - obj_start).days   # typically 62 (2 months)

    # Cascading reminder dates — proportional offsets
    # Default cycle: 62 days. We use the same absolute offsets from spec
    # but clamp them so they always fall before obj_end.
    def offset_date(days: int) -> date:
        d = obj_start + timedelta(days=days)
        return min(d, obj_end - timedelta(days=1))

    sub_dept_date   = offset_date(30)   # ~31 July in default cycle
    dept_date       = offset_date(35)   # ~5 Aug
    branch_date     = offset_date(40)   # ~10 Aug
    country_date    = offset_date(45)   # ~15 Aug
    hq_final_date   = offset_date(55)   # ~25 Aug

    action_link = "/template-management"

    # ── 1. Window Open — 1st July (obj_start) — All Users ───────────────────
    if today == obj_start:
        users = get_all_active_users()
        user_ids = [u["id"] for u in users]
        insert_notifications(
            user_ids=user_ids,
            notification_type="window_open",
            title="Objective Setting Window Is Open",
            message=(
                f"A new appraisal year has started. The objective-setting window is now open "
                f"and will close on {format_date_display(obj_end)}. "
                f"Set KPIs for editable (non-locked) objectives now."
            ),
            action_link=action_link,
            cycle_id=cycle_id,
        )

    # ── 2. Sub Dept Admin Reminder — ~31 July ───────────────────────────────
    if today == sub_dept_date:
        users    = get_users_by_org_level(5)
        user_ids = [u["id"] for u in users]
        insert_notifications(
            user_ids=user_ids,
            notification_type="subdept_reminder",
            title="Reminder: Set Team Objectives by Deadline",
            message=(
                f"Objectives must be set for your team by {format_date_display(obj_end)}. "
                f"Please begin KPI assignment now for all editable (non-locked) objectives."
            ),
            action_link=action_link,
            cycle_id=cycle_id,
        )

    # ── 3. Dept Admin Alert — ~5 August ─────────────────────────────────────
    if today == dept_date:
        users    = get_users_by_org_level(4)
        user_ids = [u["id"] for u in users]
        insert_notifications(
            user_ids=user_ids,
            notification_type="dept_alert",
            title="Alert: Verify Sub Dept Admin Progress",
            message=(
                "Objective setting is in progress. Verify that your Sub Dept Admins have "
                "begun KPI assignments for their teams."
            ),
            action_link=action_link,
            cycle_id=cycle_id,
        )

    # ── 4. Branch Admin Escalation — ~10 August ─────────────────────────────
    if today == branch_date:
        users    = get_users_by_org_level(3)
        user_ids = [u["id"] for u in users]
        insert_notifications(
            user_ids=user_ids,
            notification_type="branch_escalation",
            title="Escalation: Objective Deadline Approaching",
            message=(
                "Confirm that Dept Admins under your branch are progressing with KPI assignments. "
                f"Deadline: {format_date_display(obj_end)}."
            ),
            action_link=action_link,
            cycle_id=cycle_id,
        )

    # ── 5. Country Admin Escalation — ~15 August ────────────────────────────
    if today == country_date:
        users    = get_users_by_org_level(2)
        user_ids = [u["id"] for u in users]
        insert_notifications(
            user_ids=user_ids,
            notification_type="country_escalation",
            title="Escalation: Nearing Final Deadline",
            message=(
                f"Ensure all branches in your country have completed or are completing "
                f"KPI objective assignments by {format_date_display(obj_end)}."
            ),
            action_link=action_link,
            cycle_id=cycle_id,
        )

    # ── 6. HQ Admin Final Escalation — ~25 August ───────────────────────────
    if today == hq_final_date:
        users    = get_users_by_org_level(1)
        user_ids = [u["id"] for u in users]
        insert_notifications(
            user_ids=user_ids,
            notification_type="hq_final_escalation",
            title="Final Escalation: Objective Setting Closing Soon",
            message=(
                f"Objective setting closes on {format_date_display(obj_end)}. "
                f"Any incomplete assignments will be frozen with the previous year's KPIs. "
                f"A grace period is available until {format_date_display(grace_end)}."
            ),
            action_link=action_link,
            cycle_id=cycle_id,
        )

    # ── 7. Window Closed — 31 August (obj_end) — All Users ──────────────────
    if today == obj_end:
        users    = get_all_active_users()
        user_ids = [u["id"] for u in users]
        insert_notifications(
            user_ids=user_ids,
            notification_type="window_closed",
            title="Objective Setting Window Is Now Closed",
            message=(
                f"The objective-setting window closed on {format_date_display(obj_end)}. "
                f"All set objectives are saved. Incomplete objectives have been automatically "
                f"frozen with the previous year's KPIs."
            ),
            action_link=action_link,
            cycle_id=cycle_id,
        )

    # ── 8. Grace Period Ended — 15 September — HQ Admin only ─────────────────
    if today == grace_end:
        users    = get_users_by_org_level(1)
        user_ids = [u["id"] for u in users]
        insert_notifications(
            user_ids=user_ids,
            notification_type="grace_ended",
            title="Grace Period Ended — Templates Fully Frozen",
            message=(
                f"Grace period ended on {format_date_display(grace_end)}. "
                f"PMS templates are now fully frozen. "
                f"No further changes are permitted until the next appraisal cycle."
            ),
            action_link=action_link,
            cycle_id=cycle_id,
        )

    print(f"✅ Notification check complete for {today}")


# ─────────────────────────────────────────────────────────────────────────────
# SCHEDULER STARTUP
# ─────────────────────────────────────────────────────────────────────────────

def start_scheduler():
    """Start the APScheduler background scheduler. Call once at app startup."""
    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        check_and_send_notifications,
        CronTrigger(hour=8, minute=0),   # Runs every day at 08:00 UTC
        id="daily_notification_check",
        replace_existing=True,
        misfire_grace_time=3600,         # Allow up to 1 hour late if server was down
    )
    scheduler.start()
    print("✅ Notification scheduler started (daily @ 08:00 UTC)")


# ─────────────────────────────────────────────────────────────────────────────
# API ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@notifications_bp.route("/api/notifications/<user_id>", methods=["GET"])
def get_notifications(user_id):
    """
    Returns all notifications for the given user_id, ordered newest first.
    Query param: ?unread_only=true to filter unread only.
    """
    try:
        unread_only = request.args.get("unread_only", "false").lower() == "true"
        query = (
            _supabase.table("notifications")
            .select("*")
            .eq("receiver_id", user_id)
            .order("created_at", desc=True)
        )
        if unread_only:
            query = query.eq("is_read", False)

        result = query.execute()
        return jsonify(result.data or []), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@notifications_bp.route("/api/notifications/<notification_id>/read", methods=["PATCH"])
def mark_notification_read(notification_id):
    """Mark a single notification as read."""
    try:
        _supabase.table("notifications").update({
            "is_read": True,
            "read_at": datetime.utcnow().isoformat(),
        }).eq("id", notification_id).execute()
        return jsonify({"message": "Marked as read"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@notifications_bp.route("/api/notifications/mark-all-read/<user_id>", methods=["PATCH"])
def mark_all_notifications_read(user_id):
    """Mark all notifications for a user as read."""
    try:
        _supabase.table("notifications").update({
            "is_read": True,
            "read_at": datetime.utcnow().isoformat(),
        }).eq("receiver_id", user_id).eq("is_read", False).execute()
        return jsonify({"message": "All marked as read"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@notifications_bp.route("/api/notifications/unread-count/<user_id>", methods=["GET"])
def get_unread_count(user_id):
    """Returns the count of unread notifications for a user. Used for badge counters."""
    try:
        result = (
            _supabase.table("notifications")
            .select("id", count="exact")
            .eq("receiver_id", user_id)
            .eq("is_read", False)
            .execute()
        )
        return jsonify({"count": result.count or 0}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@notifications_bp.route("/api/notifications/trigger-test", methods=["POST"])
def trigger_test_notification():
    """
    DEV ONLY — manually fire the daily notification check.
    POST body: { "simulate_date": "2025-07-01" }  (optional, overrides today)
    Remove this route before production deployment.
    """
    data            = request.get_json() or {}
    simulate_date   = data.get("simulate_date")

    if simulate_date:
        # Temporarily monkey-patch date.today() for testing
        import unittest.mock as mock
        fake_date = datetime.fromisoformat(simulate_date).date()

        class FakeDate(date):
            @classmethod
            def today(cls):
                return fake_date

        with mock.patch("notification_routes.date", FakeDate):
            check_and_send_notifications()
    else:
        check_and_send_notifications()

    return jsonify({"message": "Notification check triggered"}), 200