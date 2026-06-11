"""
services/pms_cycle_service.py

Business logic for PMS cycle CRUD.

NOTIFICATION REFRESH POLICY
─────────────────────────────
When HQ Admin updates any of these date fields on the ACTIVE cycle:
    objective_setting_end
    grace_period_end

...all existing objective_cutoff notifications for that cycle are deleted
and re-seeded with the new dates. Previous cycle notifications are untouched.

This is handled by calling refresh_notifications_for_cycle() inside
update_pms_cycle() whenever a notification-relevant date changes.

ROLLOVER POLICY:
  Trigger date: year_end_review (not grace_period_end)
"""

from datetime import date, datetime, timedelta
from dateutil.relativedelta import relativedelta

from models.constants import (
    GRACE_PERIOD_DAYS,
    OBJECTIVE_SETTING_MONTHS,
    PMS_START_DAY,
    PMS_START_MONTH,
)
from models.supabase_client import supabase
from services.freeze_service import (
    compute_freeze_dates_from_cycle,
    get_active_pms_cycle,
    get_freeze_status,
)
from typing import Optional, Dict, Callable, Any

# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

SOURCE_NONE     = "none"
SOURCE_DATABASE = "database"
STATUS_ACTIVE   = True
STATUS_INACTIVE = False

# Fields whose change should trigger a notification refresh
NOTIFICATION_DATE_FIELDS = {"objective_setting_end", "grace_period_end"}


# ─────────────────────────────────────────────────────────────────────────────
# INTERNAL HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _deactivate_current_cycle() -> None:
    supabase.table("pms_cycles").update(
        {"is_active": STATUS_INACTIVE}
    ).eq("is_active", STATUS_ACTIVE).execute()


def _deactivate_cycle_by_id(cycle_id: int) -> None:
    supabase.table("pms_cycles").update(
        {"is_active": STATUS_INACTIVE}
    ).eq("id", cycle_id).execute()


def _shift_date_by_one_year(iso_str: Optional[str]) -> Optional[str]:
    if not iso_str:
        return None
    try:
        d = datetime.fromisoformat(iso_str).date()
        return date(d.year + 1, d.month, d.day).isoformat()
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# READ OPERATIONS
# ─────────────────────────────────────────────────────────────────────────────

def get_all_pms_cycles() -> list:
    return (
        supabase.table("pms_cycles")
        .select("*")
        .order("pms_year", desc=True)
        .execute()
        .data
    )


def get_active_cycle_response() -> dict:
    cycle = get_active_pms_cycle()

    if not cycle:
        return {
            "id":                      None,
            "pms_year":                None,
            "pms_start":               None,
            "objective_setting_start": None,
            "objective_setting_end":   None,
            "objective_end":           None,
            "grace_end":               None,
            "grace_period_end":        None,
            "mid_year_review":         None,
            "year_end_review":         None,
            "is_active":               False,
            "freeze_status":           "frozen",
            "source":                  SOURCE_NONE,
            "message": (
                "No active PMS cycle. "
                "Templates are frozen. "
                "HQ Admin must open the next cycle."
            ),
        }

    dates = compute_freeze_dates_from_cycle(cycle)
    return {
        **cycle,
        "objective_end":         dates["objective_end"].isoformat(),
        "grace_end":             dates["grace_end"].isoformat(),
        "objective_setting_end": dates["objective_end"].isoformat(),
        "grace_period_end":      dates["grace_end"].isoformat(),
        "freeze_status":         get_freeze_status(),
        "source":                SOURCE_DATABASE,
    }


def get_debug_freeze_info() -> dict:
    today = date.today()
    cycle = get_active_pms_cycle()

    if not cycle:
        return {
            "today":         str(today),
            "cycle":         None,
            "source":        SOURCE_NONE,
            "freeze_status": "frozen",
            "message":       "No active PMS cycle. Templates are frozen.",
        }

    dates = compute_freeze_dates_from_cycle(cycle)
    return {
        "today":                    str(today),
        "source":                   SOURCE_DATABASE,
        "active_cycle_id":          cycle["id"],
        "active_cycle_year":        cycle["pms_year"],
        "pms_start":                str(cycle.get("pms_start")),
        "objective_setting_start":  str(cycle.get("objective_setting_start")),
        "objective_setting_end":    str(dates["objective_end"]),
        "grace_period_end":         str(dates["grace_end"]),
        "year_end_review":          str(cycle.get("year_end_review")),
        "freeze_status":            get_freeze_status(),
        "rollover_triggers_on":     str(cycle.get("year_end_review")) + " (year_end_review)",
    }


# ─────────────────────────────────────────────────────────────────────────────
# WRITE OPERATIONS
# ─────────────────────────────────────────────────────────────────────────────

def update_pms_cycle(cycle_id: int, data: dict, seed_fn=None) -> None:
    """
    Update cycle dates. 

    If any notification-relevant date (objective_setting_end, grace_period_end)
    changed on the ACTIVE cycle, purge all existing notifications for that cycle
    and re-seed them with the new dates so users see fresh notifications
    reflecting the updated schedule.

    Previous cycle notifications are never affected.
    """
    updatable_fields = [
        "objective_setting_start",
        "objective_setting_end",
        "grace_period_end",
        "mid_year_review",
        "year_end_review",
    ]
    payload = {f: data[f] for f in updatable_fields if data.get(f)}

    if payload:
        supabase.table("pms_cycles").update(payload).eq("id", cycle_id).execute()

    # ── Refresh notifications if a date that affects the schedule changed ─────
    notification_dates_changed = bool(
        NOTIFICATION_DATE_FIELDS & set(payload.keys())
    )
    if notification_dates_changed:
        _refresh_notifications_for_updated_cycle(cycle_id)

    # ── Immediately check if rollover is needed ───────────────────────────────
    if seed_fn:
        auto_rollover_if_needed(seed_fn)


def _refresh_notifications_for_updated_cycle(cycle_id: int) -> None:
    """
    Internal: re-fetch the updated cycle row and call
    refresh_notifications_for_cycle so the service always uses the latest
    DB values (not stale in-memory data from before the update).
    """
    try:
        # Import here to avoid circular imports at module level
        from services.notification_service import refresh_notifications_for_cycle

        result = (
            supabase.table("pms_cycles")
            .select("id, pms_year, is_active, objective_setting_end, grace_period_end")
            .eq("id", cycle_id)
            .limit(1)
            .execute()
        )
        if result.data:
            cycle = result.data[0]
            refresh_notifications_for_cycle(cycle)
            print(
                f"🔄 Notifications refreshed for cycle "
                f"{cycle.get('pms_year')} (cycle_id={cycle_id})"
            )
        else:
            print(f"⚠️  _refresh_notifications: cycle_id={cycle_id} not found")
    except Exception as e:
        print(f"❌ _refresh_notifications_for_updated_cycle: {e}")


def create_pms_cycle(data: dict, seed_fn) -> dict:
    """HQ Admin explicitly creates a new cycle."""
    year = data.get("pms_year")
    if not year:
        raise ValueError("pms_year is required")

    year          = int(year)
    pms_start     = date(year, PMS_START_MONTH, PMS_START_DAY)
    obj_start     = pms_start
    objective_end = pms_start + relativedelta(months=OBJECTIVE_SETTING_MONTHS)
    grace_end     = objective_end + timedelta(days=GRACE_PERIOD_DAYS)

    _deactivate_current_cycle()

    result = supabase.table("pms_cycles").insert({
        "pms_year":                year,
        "pms_start":               pms_start.isoformat(),
        "objective_setting_start": obj_start.isoformat(),
        "objective_setting_end":   objective_end.isoformat(),
        "grace_period_end":        grace_end.isoformat(),
        "mid_year_review":         data.get("mid_year_review"),
        "year_end_review":         data.get("year_end_review"),
        "is_active":               STATUS_ACTIVE,
        "created_at":              datetime.now().isoformat(),
    }).execute()

    if result.data:
        seed_fn(result.data[0])

    return result.data[0]


def close_active_pms_cycle() -> dict:
    cycle = get_active_pms_cycle()
    if not cycle:
        raise LookupError("No active PMS cycle found.")
    _deactivate_cycle_by_id(cycle["id"])
    return cycle


def open_next_pms_cycle(data: dict, seed_fn) -> dict:
    """HQ Admin explicitly opens next year's cycle."""
    current   = get_active_pms_cycle()
    next_year = int(current["pms_year"]) + 1 if current else date.today().year

    if current:
        _deactivate_cycle_by_id(current["id"])

    pms_start     = date(next_year, PMS_START_MONTH, PMS_START_DAY)
    obj_start     = pms_start
    objective_end = pms_start + relativedelta(months=OBJECTIVE_SETTING_MONTHS)
    grace_end     = objective_end + timedelta(days=GRACE_PERIOD_DAYS)

    result = supabase.table("pms_cycles").insert({
        "pms_year":                next_year,
        "pms_start":               pms_start.isoformat(),
        "objective_setting_start": obj_start.isoformat(),
        "objective_setting_end":   objective_end.isoformat(),
        "grace_period_end":        grace_end.isoformat(),
        "mid_year_review":         data.get("mid_year_review"),
        "year_end_review":         data.get("year_end_review"),
        "is_active":               STATUS_ACTIVE,
        "created_at":              datetime.now().isoformat(),
    }).execute()

    if result.data:
        seed_fn(result.data[0])

    return result.data[0]


# ─────────────────────────────────────────────────────────────────────────────
# AUTO ROLLOVER
# ─────────────────────────────────────────────────────────────────────────────

def auto_rollover_if_needed(seed_fn: Optional[Callable[[Dict[str, Any]], None]]) -> Optional[Dict[str, Any]]:
    """
    Python backup rollover — mirrors the Supabase SQL function.
    Trigger: year_end_review date passing.
    """
    try:
        cycle = get_active_pms_cycle()

        if not cycle:
            print("⚠️  auto_rollover: no active cycle found — skipping.")
            return None

        year_end_str = cycle.get("year_end_review")
        if not year_end_str:
            print(
                f"⚠️  auto_rollover: cycle {cycle['pms_year']} has no "
                "year_end_review set — cannot auto-rollover."
            )
            return None

        year_end = datetime.fromisoformat(year_end_str).date()
        today    = date.today()

        if today <= year_end:
            return None

        print(
            f"📅  auto_rollover: cycle {cycle['pms_year']} year_end_review "
            f"{year_end} passed — rolling over."
        )

        next_pms_start = _shift_date_by_one_year(cycle.get("pms_start"))
        next_obj_start = _shift_date_by_one_year(cycle.get("objective_setting_start"))
        next_obj_end   = _shift_date_by_one_year(cycle.get("objective_setting_end"))
        next_grace_end = _shift_date_by_one_year(cycle.get("grace_period_end"))
        next_mid_year  = _shift_date_by_one_year(cycle.get("mid_year_review"))
        next_year_end  = _shift_date_by_one_year(cycle.get("year_end_review"))

        if not next_pms_start or not next_obj_end or not next_grace_end or not next_year_end:
            print("❌  auto_rollover: could not compute next dates — skipping.")
            return None

        next_year = datetime.fromisoformat(next_pms_start).year

        existing = (
            supabase.table("pms_cycles")
            .select("id, is_active")
            .eq("pms_year", next_year)
            .execute()
            .data
        )

        if existing:
            print(f"⚠️  auto_rollover: cycle {next_year} already exists — activating it.")
            _deactivate_cycle_by_id(cycle["id"])
            supabase.table("pms_cycles").update(
                {"is_active": True}
            ).eq("pms_year", next_year).execute()
            return None

        _deactivate_cycle_by_id(cycle["id"])

        result = supabase.table("pms_cycles").insert({
            "pms_year":                next_year,
            "pms_start":               next_pms_start,
            "objective_setting_start": next_obj_start,
            "objective_setting_end":   next_obj_end,
            "grace_period_end":        next_grace_end,
            "mid_year_review":         next_mid_year,
            "year_end_review":         next_year_end,
            "is_active":               True,
            "created_at":              datetime.now().isoformat(),
        }).execute()

        if result.data:
            new_cycle = result.data[0]
            print(
                f"✅  auto_rollover: created and activated cycle {next_year}.\n"
                f"    objective_setting_end = {next_obj_end}\n"
                f"    grace_period_end      = {next_grace_end}\n"
                f"    year_end_review       = {next_year_end}"
            )
            if seed_fn:
                seed_fn(new_cycle)
            return new_cycle

    except Exception as error:
        print(f"❌  auto_rollover_if_needed failed: {error}")

    return None
