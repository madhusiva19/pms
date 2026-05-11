"""
notification_routes.py — Objective Cut-off Notification System
No per-user receiver_id needed — notifications are fetched by role/level.
"""

from flask import Blueprint, request, jsonify
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from datetime import datetime, date, timezone
import uuid

notifications_bp = Blueprint("notifications", __name__)

_supabase = None

# ─────────────────────────────────────────────────────────────────────────────
# SCHEDULE DEFINITION
# ─────────────────────────────────────────────────────────────────────────────

CUTOFF_SCHEDULE = [
    {
        "mmdd":        "07-01",
        "role":        "all",
        "level":       99,          # visible to everyone
        "title":       "Appraisal Year Started",
        "message":     "New appraisal year has started. Objective setting window is now open.",
        "action_link": "/notifications",
    },
    {
        "mmdd":        "07-31",
        "role":        "sub_dept_admin",
        "level":       5,
        "title":       "Objective Setting Reminder",
        "message":     "Reminder: Objectives must be set for your team by 31st August. Please begin KPI assignment now.",
        "action_link": "/template-management",
    },
    {
        "mmdd":        "08-05",
        "role":        "dept_admin",
        "level":       4,
        "title":       "Objective Setting Alert",
        "message":     "Alert: Objective setting is in progress. Verify that your Sub Dept Admins have begun KPI assignments for their teams.",
        "action_link": "/template-management",
    },
    {
        "mmdd":        "08-10",
        "role":        "branch_admin",
        "level":       3,
        "title":       "Objective Setting Escalation",
        "message":     "Escalation: Objective setting deadline approaching. Confirm that Dept Admins under your branch are progressing with KPI assignments.",
        "action_link": "/template-management",
    },
    {
        "mmdd":        "08-15",
        "role":        "country_admin",
        "level":       2,
        "title":       "Objective Setting Escalation",
        "message":     "Escalation: Objective setting is nearing final deadline. Ensure all branches in your country have completed or are completing KPI objective assignments.",
        "action_link": "/template-management",
    },
    {
        "mmdd":        "08-25",
        "role":        "hq_admin",
        "level":       1,
        "title":       "Final Escalation — Deadline in 6 Days",
        "message":     "Final Escalation: Objective setting closes on 31st August. Any incomplete assignments will be frozen with the previous year's KPIs. Grace period available until 15th September.",
        "action_link": "/template-management",
    },
    {
        "mmdd":        "08-31",
        "role":        "all",
        "level":       99,
        "title":       "Objective Setting Window Closed",
        "message":     "Objective setting window is now CLOSED. All set objectives are saved. Incomplete objectives are automatically frozen with previous year KPIs.",
        "action_link": "/notifications",
    },
    {
        "mmdd":        "09-15",
        "role":        "hq_admin",
        "level":       1,
        "title":       "Grace Period Ended — Templates Frozen",
        "message":     "Grace period has ended. PMS templates are now fully frozen. No further changes permitted until the next appraisal cycle.",
        "action_link": "/notifications",
    },
]

# ─────────────────────────────────────────────────────────────────────────────
# Level → which schedule entries are visible
# Rule: an entry is visible if entry.level >= user_level OR entry.role == "all"
# e.g. level=1 (HQ) sees everything; level=5 sees only level>=5 + "all"
# ─────────────────────────────────────────────────────────────────────────────

def _entries_for_level(user_level: int) -> list:
    result = []
    for entry in CUTOFF_SCHEDULE:
        if entry["role"] == "all":
            result.append(entry)
        elif entry["level"] >= user_level:
            result.append(entry)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def init_notifications(supabase_client):
    global _supabase
    _supabase = supabase_client


def _get_active_cycle():
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
        print(f"❌ _get_active_cycle: {e}")
        return None


def _build_trigger_key(pms_year: int, mmdd: str, role: str) -> str:
    return f"{pms_year}-{mmdd}:{role}"


def _already_fired(cycle_id: int, trigger_key: str) -> bool:
    try:
        result = (
            _supabase.table("notifications")
            .select("id")
            .eq("pms_cycle_id", cycle_id)
            .eq("trigger_key", trigger_key)
            .limit(1)
            .execute()
        )
        return bool(result.data)
    except Exception:
        return False


def _fire_notification(cycle: dict, entry: dict) -> bool:
    """
    Inserts ONE notification row per schedule entry (not per user).
    receiver_id is NULL — looked up by level/role on the frontend.
    Returns True if inserted, False if already existed.
    """
    pms_year    = cycle["pms_year"]
    cycle_id    = cycle["id"]
    trigger_key = _build_trigger_key(pms_year, entry["mmdd"], entry["role"])

    if _already_fired(cycle_id, trigger_key):
        print(f"⏭  Already fired: {trigger_key}")
        return False

    now = datetime.now(timezone.utc).isoformat()
    try:
        _supabase.table("notifications").insert({
            "id":           str(uuid.uuid4()),
            "receiver_id":  None,           # no per-user targeting — fetched by level
            "type":         "objective_cutoff",
            "title":        entry["title"],
            "message":      entry["message"],
            "action_link":  entry["action_link"],
            "triggered_by": "system",
            "is_read":      False,
            "pms_cycle_id": cycle_id,
            "trigger_key":  trigger_key,
            "created_at":   now,
        }).execute()
        print(f"✅ Fired: {trigger_key}")
        return True
    except Exception as e:
        print(f"❌ _fire_notification({trigger_key}): {e}")
        return False


# ─────────────────────────────────────────────────────────────────────────────
# DAILY SCHEDULER JOB
# ─────────────────────────────────────────────────────────────────────────────

def run_cutoff_notifications_job():
    print(f"🔔 run_cutoff_notifications_job: {datetime.now().isoformat()}")
    cycle = _get_active_cycle()
    if not cycle:
        print("⚠️  No active cycle — skipping notification job")
        return

    pms_year = cycle["pms_year"]
    today    = date.today().isoformat()

    for entry in CUTOFF_SCHEDULE:
        trigger_date = f"{pms_year}-{entry['mmdd']}"
        if today >= trigger_date:
            _fire_notification(cycle, entry)


def start_scheduler():
    scheduler = BackgroundScheduler()
    scheduler.add_job(
        run_cutoff_notifications_job,
        CronTrigger(hour=8, minute=0),
        id="cutoff_notifications",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    scheduler.start()
    print("✅ Notification scheduler started (daily @ 08:00)")
    # Catch any dates already passed on startup
    run_cutoff_notifications_job()


# ─────────────────────────────────────────────────────────────────────────────
# SEED — called when a new cycle is created
# ─────────────────────────────────────────────────────────────────────────────

def seed_notifications_for_cycle(cycle: dict):
    pms_year = cycle["pms_year"]
    today    = date.today().isoformat()
    seeded   = 0

    for entry in CUTOFF_SCHEDULE:
        trigger_date = f"{pms_year}-{entry['mmdd']}"
        if today >= trigger_date:
            if _fire_notification(cycle, entry):
                seeded += 1

    print(f"✅ seed_notifications_for_cycle({pms_year}): {seeded} row(s) seeded")


# ─────────────────────────────────────────────────────────────────────────────
# REST ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@notifications_bp.route("/notifications/by-level", methods=["GET"])
def get_notifications_by_level():
    """
    GET /notifications/by-level
    Header: X-User-Level: 1  (1=HQ, 2=Country, 3=Branch, 4=Dept, 5=SubDept)

    Returns all triggered objective_cutoff notifications visible to this level,
    newest first. No user_id needed.

    Visibility rule: entry is shown if entry.level >= user_level OR role == "all"
    e.g. level=1 sees everything (HQ sees all escalations)
         level=3 sees branch_admin + dept_admin + sub_dept_admin + all
         level=5 sees only sub_dept_admin + all
    """
    try:
        user_level = int(request.headers.get("X-User-Level", 99))

        # Get the trigger_keys visible to this level
        cycle = _get_active_cycle()
        if not cycle:
            return jsonify([]), 200

        pms_year        = cycle["pms_year"]
        visible_entries = _entries_for_level(user_level)
        visible_keys    = [
            _build_trigger_key(pms_year, e["mmdd"], e["role"])
            for e in visible_entries
        ]

        if not visible_keys:
            return jsonify([]), 200

        rows = (
            _supabase.table("notifications")
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


@notifications_bp.route("/notifications/unread-count", methods=["GET"])
def get_unread_count():
    """
    GET /notifications/unread-count
    Header: X-User-Level: 1

    Returns count of unread objective_cutoff notifications for this level.
    Used for the sidebar bell badge.
    """
    try:
        user_level = int(request.headers.get("X-User-Level", 99))

        cycle = _get_active_cycle()
        if not cycle:
            return jsonify({"unread_count": 0}), 200

        pms_year        = cycle["pms_year"]
        visible_entries = _entries_for_level(user_level)
        visible_keys    = [
            _build_trigger_key(pms_year, e["mmdd"], e["role"])
            for e in visible_entries
        ]

        if not visible_keys:
            return jsonify({"unread_count": 0}), 200

        # Use level-keyed read state stored in a separate lightweight table
        # or fall back to counting is_read=False rows visible to this level
        result = (
            _supabase.table("notifications")
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


@notifications_bp.route("/notifications/<notif_id>/read", methods=["PATCH"])
def mark_notification_read(notif_id):
    """
    PATCH /notifications/<uuid>/read
    Marks a single notification row as read.
    Since there's one row per schedule entry (not per user), this marks it
    read for ALL users at the same level — which is fine for a shared feed.
    """
    try:
        now = datetime.now(timezone.utc).isoformat()
        _supabase.table("notifications").update({
            "is_read": True,
            "read_at": now,
        }).eq("id", notif_id).execute()
        return jsonify({"message": "Marked as read"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@notifications_bp.route("/notifications/mark-all-read", methods=["PATCH"])
def mark_all_read():
    """
    PATCH /notifications/mark-all-read
    Header: X-User-Level: 1
    Marks all visible objective_cutoff notifications as read for this level.
    """
    try:
        user_level = int(request.headers.get("X-User-Level", 99))

        cycle = _get_active_cycle()
        if not cycle:
            return jsonify({"message": "No active cycle"}), 200

        pms_year        = cycle["pms_year"]
        visible_entries = _entries_for_level(user_level)
        visible_keys    = [
            _build_trigger_key(pms_year, e["mmdd"], e["role"])
            for e in visible_entries
        ]

        if not visible_keys:
            return jsonify({"message": "Nothing to mark"}), 200

        now = datetime.now(timezone.utc).isoformat()
        _supabase.table("notifications").update({
            "is_read": True,
            "read_at": now,
        }).eq("type", "objective_cutoff").eq("pms_cycle_id", cycle["id"]).in_(
            "trigger_key", visible_keys
        ).execute()

        return jsonify({"message": "All marked as read"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400


@notifications_bp.route("/notifications/cutoff-schedule", methods=["GET"])
def get_cutoff_schedule():
    """
    GET /notifications/cutoff-schedule
    Header: X-User-Level: 1

    Returns the full schedule for the active cycle, split into:
      - triggered: entries that have fired (DB rows exist)
      - upcoming:  future entries (no DB row yet)

    Used by the frontend to build the timeline without needing extra fetches.
    """
    try:
        user_level = int(request.headers.get("X-User-Level", 99))
        cycle      = _get_active_cycle()
        if not cycle:
            return jsonify({"schedule": [], "cycle": None}), 200

        pms_year        = cycle["pms_year"]
        today           = date.today().isoformat()
        visible_entries = _entries_for_level(user_level)

        schedule_out = []
        for entry in visible_entries:
            trigger_date = f"{pms_year}-{entry['mmdd']}"
            days_until   = max(0, (date.fromisoformat(trigger_date) - date.today()).days)
            schedule_out.append({
                "trigger_date":  trigger_date,
                "role":          entry["role"],
                "level":         entry["level"],
                "title":         entry["title"],
                "message":       entry["message"],
                "action_link":   entry["action_link"],
                "trigger_key":   _build_trigger_key(pms_year, entry["mmdd"], entry["role"]),
                "is_triggered":  today >= trigger_date,
                "days_until":    days_until,
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


@notifications_bp.route("/notifications/fire-now", methods=["POST"])
def fire_notification_now():
    """
    POST /notifications/fire-now
    Header: X-User-Level: 1  (HQ Admin only)
    Body (optional): { "trigger_key": "2026-08-25:hq_admin" }

    Manual trigger for testing. If trigger_key omitted, fires all due entries.
    """
    try:
        user_level = int(request.headers.get("X-User-Level", 99))
        if user_level > 1:
            return jsonify({"error": "Only HQ Admin can manually trigger notifications"}), 403

        data       = request.get_json() or {}
        target_key = data.get("trigger_key", "").strip()
        cycle      = _get_active_cycle()
        if not cycle:
            return jsonify({"error": "No active cycle"}), 404

        pms_year = cycle["pms_year"]
        fired    = 0
        for entry in CUTOFF_SCHEDULE:
            key = _build_trigger_key(pms_year, entry["mmdd"], entry["role"])
            if target_key and key != target_key:
                continue
            if _fire_notification(cycle, entry):
                fired += 1

        return jsonify({"message": f"Fired {fired} notification(s)"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400



