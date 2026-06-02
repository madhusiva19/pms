"""
services/notification_service.py

Business logic for the Objective Cut-off Notification System.

SCHEDULE BEHAVIOUR
──────────────────
Every key date produces TWO notifications:
  1. Warning  — fires 10 days before the date
  2. On-date  — fires on the exact date

Grace period is special — THREE notifications:
  1. Grace period started   — fires on objective_setting_end (same day window closes)
  2. Grace period ending    — fires 3 days before grace_period_end
  3. Grace period ended     — fires on grace_period_end

All trigger dates are derived from pms_cycles fields:
    objective_setting_end   — hard cutoff
    grace_period_end        — freeze date
    cycle_start             — PMS_START_MONTH/PMS_START_DAY of pms_year

CYCLE DATE CHANGE BEHAVIOUR
────────────────────────────
When HQ Admin updates dates on the ACTIVE cycle:
  - All existing notifications for that cycle are DELETED
  - Fresh notifications are re-seeded with the new dates
  - Previous cycle notifications are NEVER touched

DEDUPLICATION
─────────────
trigger_key format: "YYYY-MM-DD:role:event_slug"
  e.g. "2026-08-16:all:obj_end_warning"
       "2026-08-16:all:obj_end"
       "2026-08-19:hq_admin:grace_warning"
       "2026-08-22:hq_admin:grace_end"

already_fired() checks pms_cycle_id + trigger_key.
"""

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron         import CronTrigger
from datetime                          import datetime, date, timedelta, timezone
import uuid

from models.supabase_client import supabase


# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

WARNING_DAYS_BEFORE     = 10   # warning fires this many days before key date
GRACE_WARNING_DAYS      = 3    # grace-period ending warning fires this many days before


# ─────────────────────────────────────────────────────────────────────────────
# DATE HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _iso(d: date) -> str:
    return d.isoformat()

def _date(iso: str) -> date:
    return datetime.fromisoformat(iso).date()

def _fmt(iso: str | None) -> str:
    """Human-readable date string for messages, e.g. 'August 16, 2026'."""
    if not iso:
        return "TBD"
    try:
        return _date(iso).strftime("%B %d, %Y")
    except Exception:
        return iso or "TBD"


# ─────────────────────────────────────────────────────────────────────────────
# SCHEDULE BUILDER — derives all entries from cycle dates
# ─────────────────────────────────────────────────────────────────────────────

def get_schedule_for_cycle(cycle: dict) -> list[dict]:
    """
    Returns the full list of notification entries for the given cycle.

    Each entry has:
        trigger_date  — "YYYY-MM-DD" when this notification should fire
        trigger_key   — unique dedup key: "YYYY-MM-DD:role:slug"
        role          — "all" | "hq_admin" | "country_admin" | etc.
        level         — int visibility level (99 = all)
        title         — notification title
        message       — notification body
        action_link   — URL
        event_type    — "warning" | "on_date" | "grace_started" |
                        "grace_warning" | "grace_ended" | "cycle_start"
    """
    from models.constants import PMS_START_MONTH, PMS_START_DAY

    pms_year      = int(cycle["pms_year"])
    obj_end_iso   = cycle.get("objective_setting_end")
    grace_end_iso = cycle.get("grace_period_end")

    obj_end_fmt   = _fmt(obj_end_iso)
    grace_end_fmt = _fmt(grace_end_iso)

    entries = []

    # ── helper to append entries cleanly ─────────────────────────────────────
    def add(trigger_iso: str, role: str, level: int,
            slug: str, event_type: str, title: str, message: str,
            action_link: str = "/notifications"):
        entries.append({
            "trigger_date": trigger_iso,
            "trigger_key":  f"{trigger_iso}:{role}:{slug}",
            "mmdd":         trigger_iso[5:],   # kept for route compat
            "role":         role,
            "level":        level,
            "event_type":   event_type,
            "title":        title,
            "message":      message,
            "action_link":  action_link,
        })

    # ─────────────────────────────────────────────────────────────────────────
    # 1. CYCLE START — uses pms_start from DB, falls back to constants
    # ─────────────────────────────────────────────────────────────────────────
    pms_start_iso = cycle.get("pms_start")
    try:
        cycle_start = _date(pms_start_iso) if pms_start_iso else date(pms_year, PMS_START_MONTH, PMS_START_DAY)
    except Exception:
        cycle_start = date(pms_year, 7, 1)

    cycle_start_fmt = _fmt(_iso(cycle_start))

    add(
        _iso(cycle_start), "all", 99,
        "cycle_start", "cycle_start",
        f"Appraisal Cycle {pms_year} Has Begun",
        f"The {pms_year} appraisal cycle started on {cycle_start_fmt}. "
        f"Objective setting window is now open and closes on {obj_end_fmt}. "
        "Please begin KPI assignments for your team.",
    )

    # ─────────────────────────────────────────────────────────────────────────
    # 2. OBJECTIVE SETTING END  (warning + on-date)
    # ─────────────────────────────────────────────────────────────────────────
    if obj_end_iso:
        obj_end = _date(obj_end_iso)

        # Warning — 10 days before
        warn_date = obj_end - timedelta(days=WARNING_DAYS_BEFORE)

        # Sub-Dept warning
        add(
            _iso(warn_date), "sub_dept_admin", 5,
            "obj_end_warning", "warning",
            "Objective Setting Deadline Approaching",
            f"Warning: Objective setting window closes on {obj_end_fmt} "
            f"({WARNING_DAYS_BEFORE} days remaining). "
            "Please ensure all KPI assignments are complete.",
            "/template-management",
        )
        # Dept warning
        add(
            _iso(warn_date), "dept_admin", 4,
            "obj_end_warning", "warning",
            "Objective Setting Deadline Approaching",
            f"Warning: Objective setting closes on {obj_end_fmt} "
            f"({WARNING_DAYS_BEFORE} days remaining). "
            "Verify your Sub-Dept Admins are completing KPI assignments.",
            "/template-management",
        )
        # Branch warning
        add(
            _iso(warn_date), "branch_admin", 3,
            "obj_end_warning", "warning",
            "Objective Setting Deadline Approaching",
            f"Warning: Objective setting closes on {obj_end_fmt} "
            f"({WARNING_DAYS_BEFORE} days remaining). "
            "Confirm Dept Admins in your branch are progressing.",
            "/template-management",
        )
        # Country warning
        add(
            _iso(warn_date), "country_admin", 2,
            "obj_end_warning", "warning",
            "Objective Setting Deadline Approaching",
            f"Warning: Objective setting closes on {obj_end_fmt} "
            f"({WARNING_DAYS_BEFORE} days remaining). "
            "Ensure all branches in your country are completing KPI assignments.",
            "/template-management",
        )
        # HQ warning
        add(
            _iso(warn_date), "hq_admin", 1,
            "obj_end_warning", "warning",
            f"Final Escalation — Deadline in {WARNING_DAYS_BEFORE} Days",
            f"Final Escalation: Objective setting closes on {obj_end_fmt}. "
            "Any incomplete assignments will be frozen with previous year KPIs. "
            f"Grace period available until {grace_end_fmt}.",
            "/template-management",
        )

        # On-date — window closed (all levels)
        add(
            _iso(obj_end), "all", 99,
            "obj_end", "on_date",
            "Objective Setting Window Closed",
            f"Objective setting window is now CLOSED as of {obj_end_fmt}. "
            "All set objectives are saved. Incomplete objectives are automatically "
            f"frozen with previous year KPIs. Grace period active until {grace_end_fmt}.",
        )

    # ─────────────────────────────────────────────────────────────────────────
    # 3. GRACE PERIOD  (started + warning + ended)
    # ─────────────────────────────────────────────────────────────────────────
    if grace_end_iso:
        grace_end = _date(grace_end_iso)

        # Grace period STARTED — fires same day as obj_end (HQ only)
        if obj_end_iso:
            add(
                obj_end_iso[:10], "hq_admin", 1,
                "grace_started", "grace_started",
                "Grace Period Now Active",
                f"Grace period is now active until {grace_end_fmt}. "
                "Admins may still make corrections during this window. "
                "Templates will be fully frozen after the grace period ends.",
            )

        # Grace period ENDING SOON — 3 days before (HQ only)
        grace_warn_date = grace_end - timedelta(days=GRACE_WARNING_DAYS)
        add(
            _iso(grace_warn_date), "hq_admin", 1,
            "grace_warning", "grace_warning",
            f"Grace Period Ending in {GRACE_WARNING_DAYS} Days",
            f"Warning: Grace period ends on {grace_end_fmt} "
            f"({GRACE_WARNING_DAYS} days remaining). "
            "After this date, PMS templates will be fully frozen with no further changes allowed.",
        )

        # Grace period ENDED — on grace_period_end (HQ only)
        add(
            _iso(grace_end), "hq_admin", 1,
            "grace_ended", "grace_ended",
            "Grace Period Ended — Templates Frozen",
            f"Grace period ended on {grace_end_fmt}. "
            "PMS templates are now fully frozen. "
            "No further changes are permitted until the next appraisal cycle.",
        )

    return entries


# ─────────────────────────────────────────────────────────────────────────────
# GRACE PERIOD BANNER  (called by route, not stored as a notification row)
# ─────────────────────────────────────────────────────────────────────────────

def get_grace_period_status(cycle: dict) -> dict | None:
    """
    Returns banner data when today falls within the grace period.
    Returns None when outside the grace period.

    Used by GET /notifications/grace-status endpoint.
    Only relevant for HQ Admin (level 1).
    """
    obj_end_iso   = cycle.get("objective_setting_end")
    grace_end_iso = cycle.get("grace_period_end")

    if not obj_end_iso or not grace_end_iso:
        return None

    today     = date.today()
    obj_end   = _date(obj_end_iso)
    grace_end = _date(grace_end_iso)

    if today < obj_end:
        return None   # objective window still open

    if today > grace_end:
        return {
            "status":      "ended",
            "message":     f"Grace period ended on {_fmt(grace_end_iso)}. Templates are fully frozen.",
            "grace_end":   grace_end_iso,
            "days_left":   0,
        }

    # today is within grace period (obj_end <= today <= grace_end)
    days_left = (grace_end - today).days
    return {
        "status":    "active",
        "message":   f"Grace period active · ends {_fmt(grace_end_iso)} ({days_left} days remaining)",
        "grace_end": grace_end_iso,
        "days_left": days_left,
    }


# ─────────────────────────────────────────────────────────────────────────────
# VISIBILITY RULE
# ─────────────────────────────────────────────────────────────────────────────

def get_entries_for_level(user_level: int, cycle: dict | None = None) -> list:
    """Returns schedule entries visible to the given user level."""
    schedule = get_schedule_for_cycle(cycle) if cycle else []
    result   = [e for e in schedule if e["role"] == "all" or e["level"] == user_level]
    print(f"[notifications] Level {user_level} visible entries: {[e['trigger_key'] for e in result]}")
    return result


# ─────────────────────────────────────────────────────────────────────────────
# ACTIVE CYCLE LOOKUP
# ─────────────────────────────────────────────────────────────────────────────

def get_active_cycle() -> dict | None:
    """Fetch the currently active PMS cycle row from pms_cycles."""
    try:
        result = (
            supabase.table("pms_cycles")
            .select("id, pms_year, is_active, objective_setting_end, grace_period_end")
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
# DEDUPLICATION
# ─────────────────────────────────────────────────────────────────────────────

def already_fired(cycle_id: int, trigger_key: str) -> bool:
    """Return True if this notification already exists for this cycle."""
    try:
        result = (
            supabase.table("notifications")
            .select("id")
            .eq("pms_cycle_id", cycle_id)
            .eq("trigger_key",  trigger_key)
            .limit(1)
            .execute()
        )
        return bool(result.data)
    except Exception:
        return False


# ─────────────────────────────────────────────────────────────────────────────
# CYCLE DATE CHANGE — delete current cycle notifications and re-seed
# ─────────────────────────────────────────────────────────────────────────────

def purge_cycle_notifications(cycle_id: int) -> int:
    """
    Deletes ALL objective_cutoff notifications for the given cycle.
    Called when HQ Admin updates cycle dates so stale notifications are removed.
    Previous cycle notifications (different cycle_id) are never touched.

    Returns the number of rows deleted.
    """
    try:
        result = (
            supabase.table("notifications")
            .delete()
            .eq("type",         "objective_cutoff")
            .eq("pms_cycle_id", cycle_id)
            .execute()
        )
        deleted = len(result.data) if result.data else 0
        print(f"🗑  purge_cycle_notifications(cycle_id={cycle_id}): {deleted} row(s) deleted")
        return deleted
    except Exception as e:
        print(f"❌ purge_cycle_notifications: {e}")
        return 0


def refresh_notifications_for_cycle(cycle: dict) -> None:
    """
    Called when HQ Admin updates cycle dates on the active cycle.
    Purges all existing notifications for this cycle and re-seeds
    only the ones whose trigger_date has already passed.
    """
    purge_cycle_notifications(cycle["id"])
    seed_notifications_for_cycle(cycle)
    print(f"🔄 refresh_notifications_for_cycle({cycle.get('pms_year')}): done")


# ─────────────────────────────────────────────────────────────────────────────
# FIRE A SINGLE NOTIFICATION
# ─────────────────────────────────────────────────────────────────────────────

def fire_notification(cycle: dict, entry: dict) -> bool:
    """
    Insert one notification row. Idempotent — skips if already exists.
    Returns True if inserted, False if skipped.
    """
    cycle_id    = cycle["id"]
    trigger_key = entry["trigger_key"]

    if already_fired(cycle_id, trigger_key):
        print(f"⏭  Already fired: {trigger_key}")
        return False

    now = datetime.now(timezone.utc).isoformat()
    try:
        supabase.table("notifications").insert({
            "id":           str(uuid.uuid4()),
            "receiver_id":  None,
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
# SEED — fire all past-due notifications for a cycle
# ─────────────────────────────────────────────────────────────────────────────

def seed_notifications_for_cycle(cycle: dict) -> None:
    """
    Fire all notifications whose trigger_date <= today.
    Skips already-inserted rows (idempotent).
    Called on new cycle creation AND after a date change (after purge).
    """
    today  = date.today().isoformat()
    seeded = 0

    for entry in get_schedule_for_cycle(cycle):
        if today >= entry["trigger_date"]:
            if fire_notification(cycle, entry):
                seeded += 1

    print(f"✅ seed_notifications_for_cycle({cycle.get('pms_year')}): {seeded} row(s) seeded")


# ─────────────────────────────────────────────────────────────────────────────
# DAILY SCHEDULER JOB
# ─────────────────────────────────────────────────────────────────────────────

def run_cutoff_notifications_job() -> None:
    """
    Runs daily at 08:00. Fires any notification whose trigger_date is today
    or earlier and hasn't been inserted yet.
    Re-fetches cycle each run so date changes are always picked up.
    """
    print(f"🔔 run_cutoff_notifications_job: {datetime.now().isoformat()}")
    cycle = get_active_cycle()
    if not cycle:
        print("⚠️  No active cycle — skipping")
        return

    today = date.today().isoformat()
    for entry in get_schedule_for_cycle(cycle):
        if today >= entry["trigger_date"]:
            fire_notification(cycle, entry)


# ─────────────────────────────────────────────────────────────────────────────
# SCHEDULER STARTUP
# ─────────────────────────────────────────────────────────────────────────────

def start_scheduler(rollover_fn=None) -> None:
    scheduler = BackgroundScheduler()

    scheduler.add_job(
        run_cutoff_notifications_job,
        CronTrigger(hour=8, minute=0),
        id="cutoff_notifications",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    print("✅  scheduler: cutoff_notifications job registered (daily 08:00).")

    if rollover_fn is not None:
        scheduler.add_job(
            func=rollover_fn,
            trigger="cron",
            hour=0,
            minute=5,
            id="auto_rollover_cycle",
            replace_existing=True,
            misfire_grace_time=3600,
        )
        print("✅  scheduler: auto_rollover_cycle job registered (daily 00:05).")

    scheduler.start()
    print("✅  APScheduler started.")
    run_cutoff_notifications_job()


# ─────────────────────────────────────────────────────────────────────────────
# LEGACY SHIMS
# ─────────────────────────────────────────────────────────────────────────────

def build_trigger_key(pms_year: int, mmdd: str, role: str) -> str:
    """Kept for route backward compatibility."""
    return f"{pms_year}-{mmdd}:{role}"

CUTOFF_SCHEDULE = []   # legacy shim — use get_schedule_for_cycle(cycle) instead

def init_notifications(_supabase_client=None) -> None:
    """No-op kept for backward compatibility."""
    pass



# ── ADD at the bottom of YOUR notification_service.py ──

import requests as req
from models import SUPABASE_URL, SUPABASE_KEY

def get_notifications(employee_id):
    try:
        result = (
            supabase.table("notifications")
            .select("*")
            .eq("receiver_id", employee_id)
            .order("created_at", desc=True)
            .execute()
        )
        return {"notifications": result.data}, 200
    except Exception as e:
        return {"message": str(e)}, 500

def mark_read(notification_id):
    try:
        url     = f"{SUPABASE_URL}/rest/v1/notifications"
        headers = {
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type":  "application/json",
            "Prefer":        "return=representation"
        }
        params   = {"id": f"eq.{notification_id}"}
        response = req.patch(url, headers=headers, params=params, json={"is_read": True})
        if response.status_code in (200, 204):
            return {"message": "Marked as read"}, 200
        return {"message": f"Failed: {response.text}"}, 400
    except Exception as e:
        return {"message": str(e)}, 500