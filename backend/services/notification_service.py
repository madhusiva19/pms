"""
services/notification_service.py

Business logic for the Objective Cut-off Notification System.

Responsibilities:
  - Define the CUTOFF_SCHEDULE (what fires when and for which role)
  - Determine which entries are visible to a given user level
  - Fire individual notification rows into the database
  - Seed past-due notifications when a new cycle is created
  - Run the daily APScheduler job
"""

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from datetime import datetime, date, timezone
import uuid

from models.supabase_client import supabase


# ─────────────────────────────────────────────────────────────────────────────
# SCHEDULE DEFINITION
# Each entry defines: which date (mmdd), which role, visibility level,
# notification title, message body, and the frontend link to navigate to.
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
# VISIBILITY RULE
#
# An entry is visible to a user if:
#   - entry.role == "all"  (broadcast to everyone), OR
#   - entry.level >= user_level  (higher-privilege roles see escalations below them)
#
# Examples:
#   level=1 (HQ Admin)   → sees all entries
#   level=3 (Branch)     → sees branch_admin + dept_admin + sub_dept_admin + all
#   level=5 (Sub Dept)   → sees only sub_dept_admin + all
# ─────────────────────────────────────────────────────────────────────────────

def get_entries_for_level(user_level: int) -> list:
    """Return schedule entries visible to the given user level."""
    result = []
    for entry in CUTOFF_SCHEDULE:
        if entry["role"] == "all":
            result.append(entry)
        elif entry["level"] >= user_level:
            result.append(entry)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# ACTIVE CYCLE LOOKUP
# ─────────────────────────────────────────────────────────────────────────────

def get_active_cycle() -> dict | None:
    """Fetch the currently active PMS cycle row."""
    try:
        result = (
            supabase.table("pms_cycles")
            .select("*")
            .eq("is_active", True)
            .order("pms_year", desc=True)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None
    except Exception as e:
        print(f"❌ get_active_cycle: {e}")
        return None


# ─────────────────────────────────────────────────────────────────────────────
# TRIGGER KEY
# A unique string that identifies one schedule entry within one cycle year.
# Format: "2025-08-25:hq_admin"
# Used to prevent duplicate notifications from being inserted.
# ─────────────────────────────────────────────────────────────────────────────

def build_trigger_key(pms_year: int, mmdd: str, role: str) -> str:
    return f"{pms_year}-{mmdd}:{role}"


def already_fired(cycle_id: int, trigger_key: str) -> bool:
    """Return True if a notification with this trigger_key already exists for this cycle."""
    try:
        result = (
            supabase.table("notifications")
            .select("id")
            .eq("pms_cycle_id", cycle_id)
            .eq("trigger_key", trigger_key)
            .limit(1)
            .execute()
        )
        return bool(result.data)
    except Exception:
        return False


# ─────────────────────────────────────────────────────────────────────────────
# FIRE A SINGLE NOTIFICATION
# Inserts ONE row per schedule entry — NOT one per user.
# receiver_id is always NULL. The frontend filters by level using trigger_key.
# ─────────────────────────────────────────────────────────────────────────────

def fire_notification(cycle: dict, entry: dict) -> bool:
    """
    Insert one notification row for the given schedule entry and cycle.
    Returns True if inserted, False if the row already existed (idempotent).
    """
    pms_year    = cycle["pms_year"]
    cycle_id    = cycle["id"]
    trigger_key = build_trigger_key(pms_year, entry["mmdd"], entry["role"])

    if already_fired(cycle_id, trigger_key):
        print(f"⏭  Already fired: {trigger_key}")
        return False

    now = datetime.now(timezone.utc).isoformat()
    try:
        supabase.table("notifications").insert({
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
        print(f"❌ fire_notification({trigger_key}): {e}")
        return False


# ─────────────────────────────────────────────────────────────────────────────
# SEED — called when a new PMS cycle is created
# Fires any schedule entries whose trigger date has already passed.
# Called from pms_cycle_service.py via the injected seed_fn.
# ─────────────────────────────────────────────────────────────────────────────

def seed_notifications_for_cycle(cycle: dict) -> None:
    """Fire all past-due notifications for a newly created cycle."""
    pms_year = cycle["pms_year"]
    today    = date.today().isoformat()
    seeded   = 0

    for entry in CUTOFF_SCHEDULE:
        trigger_date = f"{pms_year}-{entry['mmdd']}"
        if today >= trigger_date:
            if fire_notification(cycle, entry):
                seeded += 1

    print(f"✅ seed_notifications_for_cycle({pms_year}): {seeded} row(s) seeded")


# ─────────────────────────────────────────────────────────────────────────────
# DAILY SCHEDULER JOB
# Runs every morning at 08:00 and fires any entries whose date has been reached.
# ─────────────────────────────────────────────────────────────────────────────

def run_cutoff_notifications_job() -> None:
    """Check all schedule entries and fire any that are due today or overdue."""
    print(f"🔔 run_cutoff_notifications_job: {datetime.now().isoformat()}")
    cycle = get_active_cycle()
    if not cycle:
        print("⚠️  No active cycle — skipping notification job")
        return

    pms_year = cycle["pms_year"]
    today    = date.today().isoformat()

    for entry in CUTOFF_SCHEDULE:
        trigger_date = f"{pms_year}-{entry['mmdd']}"
        if today >= trigger_date:
            fire_notification(cycle, entry)


def start_scheduler() -> None:
    """Start the APScheduler background job. Also runs once immediately on startup."""
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
    # Fire any entries that were missed before the server started
    run_cutoff_notifications_job()


# ─────────────────────────────────────────────────────────────────────────────
# LEGACY INIT — kept for backward compatibility with app.py
# Previously the supabase client was passed in manually.
# Now the service imports it directly from models/supabase_client.py,
# so this function is a no-op but is kept so app.py doesn't need to change.
# ─────────────────────────────────────────────────────────────────────────────

def init_notifications(_supabase_client=None) -> None:
    """No-op kept for backward compatibility. Client now imported directly."""
    pass
