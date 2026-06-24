"""
services/notification_service.py

Combined notification service:
1. Objective Cut-off Notification System (dev-final)
2. Manual Rating Notification broadcasts (minimuthu)
"""

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron         import CronTrigger
from datetime                          import datetime, date, timedelta, timezone
import uuid
import requests as req

from models.supabase_client import supabase
from models import SUPABASE_URL, SUPABASE_KEY
from typing import Optional


# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

WARNING_DAYS_BEFORE = 10
GRACE_WARNING_DAYS  = 3


# ─────────────────────────────────────────────────────────────────────────────
# DATE HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _iso(d: date) -> str:
    return d.isoformat()

def _date(iso: str) -> date:
    return datetime.fromisoformat(iso).date()

def _fmt(iso: Optional[str]) -> str:
    """Human-readable date string for messages, e.g. 'August 16, 2026'."""
    if not iso:
        return "TBD"
    try:
        return _date(iso).strftime("%B %d, %Y")
    except Exception:
        return iso or "TBD"


# ─────────────────────────────────────────────────────────────────────────────
# SCHEDULE BUILDER (dev-final)
# ─────────────────────────────────────────────────────────────────────────────

def get_schedule_for_cycle(cycle: dict) -> list[dict]:
    from models.constants import PMS_START_MONTH, PMS_START_DAY

    pms_year      = int(cycle["pms_year"])
    obj_end_iso   = cycle.get("objective_setting_end")
    grace_end_iso = cycle.get("grace_period_end")
    obj_end_fmt   = _fmt(obj_end_iso)
    grace_end_fmt = _fmt(grace_end_iso)

    entries = []

    def add(trigger_iso: str, role: str, level: int,
            slug: str, event_type: str, title: str, message: str,
            action_link: str = "/notifications"):
        entries.append({
            "trigger_date": trigger_iso,
            "trigger_key":  f"{trigger_iso}:{role}:{slug}",
            "mmdd":         trigger_iso[5:],
            "role":         role,
            "level":        level,
            "event_type":   event_type,
            "title":        title,
            "message":      message,
            "action_link":  action_link,
        })

    # 1. CYCLE START
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

    # 2. OBJECTIVE SETTING END
    if obj_end_iso:
        obj_end   = _date(obj_end_iso)
        warn_date = obj_end - timedelta(days=WARNING_DAYS_BEFORE)

        add(_iso(warn_date), "sub_dept_admin", 5, "obj_end_warning", "warning",
            "Objective Setting Deadline Approaching",
            f"Warning: Objective setting window closes on {obj_end_fmt} "
            f"({WARNING_DAYS_BEFORE} days remaining). "
            "Please ensure all KPI assignments are complete.",
            "/template-management")
        add(_iso(warn_date), "dept_admin", 4, "obj_end_warning", "warning",
            "Objective Setting Deadline Approaching",
            f"Warning: Objective setting closes on {obj_end_fmt} "
            f"({WARNING_DAYS_BEFORE} days remaining). "
            "Verify your Sub-Dept Admins are completing KPI assignments.",
            "/template-management")
        add(_iso(warn_date), "branch_admin", 3, "obj_end_warning", "warning",
            "Objective Setting Deadline Approaching",
            f"Warning: Objective setting closes on {obj_end_fmt} "
            f"({WARNING_DAYS_BEFORE} days remaining). "
            "Confirm Dept Admins in your branch are progressing.",
            "/template-management")
        add(_iso(warn_date), "country_admin", 2, "obj_end_warning", "warning",
            "Objective Setting Deadline Approaching",
            f"Warning: Objective setting closes on {obj_end_fmt} "
            f"({WARNING_DAYS_BEFORE} days remaining). "
            "Ensure all branches in your country are completing KPI assignments.",
            "/template-management")
        add(_iso(warn_date), "hq_admin", 1, "obj_end_warning", "warning",
            f"Final Escalation — Deadline in {WARNING_DAYS_BEFORE} Days",
            f"Final Escalation: Objective setting closes on {obj_end_fmt}. "
            "Any incomplete assignments will be frozen with previous year KPIs. "
            f"Grace period available until {grace_end_fmt}.",
            "/template-management")
        add(_iso(obj_end), "all", 99, "obj_end", "on_date",
            "Objective Setting Window Closed",
            f"Objective setting window is now CLOSED as of {obj_end_fmt}. "
            "All set objectives are saved. Incomplete objectives are automatically "
            f"frozen with previous year KPIs. Grace period active until {grace_end_fmt}.")

    # 3. GRACE PERIOD
    if grace_end_iso:
        grace_end = _date(grace_end_iso)

        if obj_end_iso:
            add(obj_end_iso[:10], "hq_admin", 1, "grace_started", "grace_started",
                "Grace Period Now Active",
                f"Grace period is now active until {grace_end_fmt}. "
                "Admins may still make corrections during this window. "
                "Templates will be fully frozen after the grace period ends.")

        grace_warn_date = grace_end - timedelta(days=GRACE_WARNING_DAYS)
        add(_iso(grace_warn_date), "hq_admin", 1, "grace_warning", "grace_warning",
            f"Grace Period Ending in {GRACE_WARNING_DAYS} Days",
            f"Warning: Grace period ends on {grace_end_fmt} "
            f"({GRACE_WARNING_DAYS} days remaining). "
            "After this date, PMS templates will be fully frozen with no further changes allowed.")

        add(_iso(grace_end), "hq_admin", 1, "grace_ended", "grace_ended",
            "Grace Period Ended — Templates Frozen",
            f"Grace period ended on {grace_end_fmt}. "
            "PMS templates are now fully frozen. "
            "No further changes are permitted until the next appraisal cycle.")

    return entries


# ─────────────────────────────────────────────────────────────────────────────
# GRACE PERIOD BANNER (dev-final)
# ─────────────────────────────────────────────────────────────────────────────

def get_grace_period_status(cycle: dict) -> Optional[dict]:
    obj_end_iso   = cycle.get("objective_setting_end")
    grace_end_iso = cycle.get("grace_period_end")

    if not obj_end_iso or not grace_end_iso:
        return None

    today     = date.today()
    obj_end   = _date(obj_end_iso)
    grace_end = _date(grace_end_iso)

    if today < obj_end:
        return None

    if today > grace_end:
        return {
            "status":    "ended",
            "message":   f"Grace period ended on {_fmt(grace_end_iso)}. Templates are fully frozen.",
            "grace_end": grace_end_iso,
            "days_left": 0,
        }

    days_left = (grace_end - today).days
    return {
        "status":    "active",
        "message":   f"Grace period active · ends {_fmt(grace_end_iso)} ({days_left} days remaining)",
        "grace_end": grace_end_iso,
        "days_left": days_left,
    }


# ─────────────────────────────────────────────────────────────────────────────
# VISIBILITY RULE (dev-final)
# ─────────────────────────────────────────────────────────────────────────────

def get_entries_for_level(user_level: int, cycle: Optional[dict] = None) -> list:
    schedule = get_schedule_for_cycle(cycle) if cycle else []
    result   = [e for e in schedule if e["role"] == "all" or e["level"] == user_level]
    print(f"[notifications] Level {user_level} visible entries: {[e['trigger_key'] for e in result]}")
    return result


# ─────────────────────────────────────────────────────────────────────────────
# ACTIVE CYCLE LOOKUP (dev-final)
# ─────────────────────────────────────────────────────────────────────────────

def get_active_cycle() -> Optional[dict]:
    try:
        result = (
            supabase.table("pms_cycles")
            .select("id, pms_year, is_active, pms_start, objective_setting_end, grace_period_end")
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
# DEDUPLICATION (dev-final)
# ─────────────────────────────────────────────────────────────────────────────

def already_fired(cycle_id: int, trigger_key: str) -> bool:
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
# CYCLE DATE CHANGE (dev-final)
# ─────────────────────────────────────────────────────────────────────────────

def purge_cycle_notifications(cycle_id: int) -> int:
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
    purge_cycle_notifications(cycle["id"])
    seed_notifications_for_cycle(cycle)
    print(f"🔄 refresh_notifications_for_cycle({cycle.get('pms_year')}): done")


# ─────────────────────────────────────────────────────────────────────────────
# FIRE A SINGLE NOTIFICATION (dev-final)
# ─────────────────────────────────────────────────────────────────────────────

def fire_notification(cycle: dict, entry: dict) -> bool:
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
# SEED (dev-final)
# ─────────────────────────────────────────────────────────────────────────────

def seed_notifications_for_cycle(cycle: dict) -> None:
    today  = date.today().isoformat()
    seeded = 0

    for entry in get_schedule_for_cycle(cycle):
        if entry["event_type"] == "cycle_start" or today >= entry["trigger_date"]:
            if fire_notification(cycle, entry):
                seeded += 1

    print(f"✅ seed_notifications_for_cycle({cycle.get('pms_year')}): {seeded} row(s) seeded")


# ─────────────────────────────────────────────────────────────────────────────
# DAILY SCHEDULER JOB (dev-final)
# ─────────────────────────────────────────────────────────────────────────────

def run_cutoff_notifications_job() -> None:
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
# SCHEDULER STARTUP (dev-final)
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
# LEGACY SHIMS (dev-final)
# ─────────────────────────────────────────────────────────────────────────────

def build_trigger_key(pms_year: int, mmdd: str, role: str) -> str:
    return f"{pms_year}-{mmdd}:{role}"

CUTOFF_SCHEDULE = []

def init_notifications(_supabase_client=None) -> None:
    pass


# ─────────────────────────────────────────────────────────────────────────────
# LEGACY NOTIFICATION HELPERS (dev-final)
# ─────────────────────────────────────────────────────────────────────────────

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


# ─────────────────────────────────────────────────────────────────────────────
# MANUAL RATING BROADCAST HELPERS (minimuthu)
# ─────────────────────────────────────────────────────────────────────────────

def _get_valid_manager_ids(evaluators: list[dict]) -> set[str]:
    all_manager_ids = list({
        e["manager_id"]
        for e in evaluators
        if e.get("manager_id")
    })

    if not all_manager_ids:
        return set()

    rows = (
        supabase.table("users")
        .select("id")
        .in_("id", all_manager_ids)
        .execute()
        .data
        or []
    )
    return {r["id"] for r in rows}


def _count_manual_objectives(template_id: int) -> int:
    cat_res = (
        supabase.table("categories")
        .select("id")
        .eq("template_id", template_id)
        .execute()
    )
    cat_ids = [c["id"] for c in (cat_res.data or [])]

    if not cat_ids:
        return 0

    obj_res = (
        supabase.table("objectives")
        .select("id")
        .in_("category_id", cat_ids)
        .eq("kpi_scale", "manual")
        .execute()
    )
    return len(obj_res.data or [])


def _count_submitted(user_id: str, period: str, pms_year: int) -> int:
    res = (
        supabase.table("performance_records")
        .select("objective_id")
        .eq("user_id", user_id)
        .eq("period", period)
        .eq("year", pms_year)
        .not_.is_("manual_rating", "null")
        .execute()
    )
    return len(res.data or [])


# ─────────────────────────────────────────────────────────────────────────────
# MANUAL RATING BROADCAST (minimuthu)
# ─────────────────────────────────────────────────────────────────────────────

def broadcast_notifications(
    notif_type: str,
    period: str,
    pms_year: int,
) -> int:
    evaluator_roles = ["branch_admin", "dept_admin", "sub_dept_admin", "country_admin"]

    evaluators = (
        supabase.table("users")
        .select("id, full_name, manager_id, role")
        .in_("role", evaluator_roles)
        .execute()
        .data
        or []
    )

    valid_manager_ids = _get_valid_manager_ids(evaluators)
    notifications_to_insert: list[dict] = []

    for evaluator in evaluators:
        assign_res = (
            supabase.table("template_assignments")
            .select("template_id")
            .eq("user_id", evaluator["id"])
            .limit(1)
            .execute()
        )
        if not assign_res.data:
            continue

        template_id   = assign_res.data[0]["template_id"]
        total_manual  = _count_manual_objectives(template_id)
        submitted     = _count_submitted(evaluator["id"], period, pms_year)
        pending       = max(0, total_manual - submitted)
        manager_id    = evaluator.get("manager_id")
        valid_manager = manager_id if manager_id in valid_manager_ids else None

        if notif_type == "period_opened":
            notifications_to_insert.append({
                "recipient_id": evaluator["id"],
                "sender_id":    None,
                "type":         "period_opened",
                "title":        f"Manual Rating Window Open — {period} {pms_year}",
                "message": (
                    f"The manual rating window for {period} {pms_year} is now open. "
                    f"You have {total_manual} manual KPI(s) to rate. "
                    "Please complete all ratings before the deadline."
                ),
                "period":   period,
                "pms_year": pms_year,
                "is_read":  False,
            })

        elif notif_type == "deadline_warning" and pending > 0:
            plural = "s" if pending > 1 else ""
            notifications_to_insert.append({
                "recipient_id": evaluator["id"],
                "sender_id":    None,
                "type":         "deadline_warning",
                "title":        f"Manual Ratings Due in 3 Days — {period} {pms_year}",
                "message": (
                    f"You have {pending} pending manual rating{plural} due in 3 days "
                    f"for {period} {pms_year}. "
                    "Please complete them before the window closes."
                ),
                "period":   period,
                "pms_year": pms_year,
                "is_read":  False,
            })
            if valid_manager:
                notifications_to_insert.append({
                    "recipient_id": valid_manager,
                    "sender_id":    None,
                    "type":         "supervisor_alert",
                    "title":        f"Team Member Has Pending Ratings — {period} {pms_year}",
                    "message": (
                        f"{evaluator['full_name']} has {pending} pending manual "
                        f"rating{plural} due in 3 days for {period} {pms_year}. "
                        "Please follow up."
                    ),
                    "period":   period,
                    "pms_year": pms_year,
                    "is_read":  False,
                })

        elif notif_type == "period_closed" and pending > 0 and valid_manager:
            plural = "s" if pending > 1 else ""
            notifications_to_insert.append({
                "recipient_id": valid_manager,
                "sender_id":    None,
                "type":         "supervisor_alert",
                "title":        f"Incomplete Ratings After Period Closed — {period} {pms_year}",
                "message": (
                    f"{evaluator['full_name']} has {pending} incomplete manual "
                    f"rating{plural} after the {period} {pms_year} window has closed."
                ),
                "period":   period,
                "pms_year": pms_year,
                "is_read":  False,
            })

    if notifications_to_insert:
        supabase.table("manual_rating_notifications").insert(
            notifications_to_insert
        ).execute()

    return len(notifications_to_insert)


# ─────────────────────────────────────────────────────────────────────────────
# SEND ONE-TO-ONE REMINDER (minimuthu)
# ─────────────────────────────────────────────────────────────────────────────

def send_reminder(
    sender_id: str,
    recipient_id: str,
    period: str,
    pms_year: int,
    message: str,
) -> dict:
    recipient_res = (
        supabase.table("users")
        .select("id, full_name, manager_id")
        .eq("id", recipient_id)
        .single()
        .execute()
    )

    if not recipient_res.data:
        raise ValueError("Recipient not found")

    if str(recipient_res.data.get("manager_id")) != str(sender_id):
        raise PermissionError("Sender is not the direct manager of this recipient")

    sender_res = (
        supabase.table("users")
        .select("full_name")
        .eq("id", sender_id)
        .single()
        .execute()
    )
    sender_name = (
        sender_res.data.get("full_name", "Your Supervisor")
        if sender_res.data
        else "Your Supervisor"
    )

    final_message = message or (
        f"{sender_name} has requested you complete your pending manual "
        f"ratings for {period} {pms_year} urgently."
    )

    supabase.table("manual_rating_notifications").insert({
        "recipient_id": recipient_id,
        "sender_id":    sender_id,
        "type":         "manual_reminder",
        "title":        "Manual Rating Reminder",
        "message":      final_message,
        "period":       period,
        "pms_year":     pms_year,
        "is_read":      False,
    }).execute()

    return {"success": True}