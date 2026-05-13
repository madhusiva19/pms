"""
services/freeze_service.py

All freeze-status logic: computing dates, determining open/grace/frozen
state, and per-role edit permission checks.
"""

from datetime import date, timedelta
from datetime import datetime
from dateutil.relativedelta import relativedelta
from flask import request

from models.constants import (
    OBJECTIVE_SETTING_MONTHS,
    GRACE_PERIOD_DAYS,
    PMS_START_MONTH,
    PMS_START_DAY,
)
from models.supabase_client import supabase


# ─────────────────────────────────────────────────────────────────────────────
# ACTIVE CYCLE LOOKUP
# ─────────────────────────────────────────────────────────────────────────────

def get_active_pms_cycle() -> dict | None:
    try:
        result = (
            supabase.table("pms_cycles")
            .select("*")
            .eq("is_active", True)
            .order("pms_year", desc=True)
            .limit(1)
            .execute()
        )
        if result.data:
            return result.data[0]
    except Exception:
        pass
    return None


# ─────────────────────────────────────────────────────────────────────────────
# DATE COMPUTATION
# ─────────────────────────────────────────────────────────────────────────────

def compute_freeze_dates_from_cycle(cycle: dict) -> dict:
    pms_start = datetime.fromisoformat(cycle["pms_start"]).date()
    objective_end = (
        datetime.fromisoformat(cycle["objective_setting_end"]).date()
        if cycle.get("objective_setting_end")
        else pms_start + relativedelta(months=OBJECTIVE_SETTING_MONTHS)
    )
    grace_end = (
        datetime.fromisoformat(cycle["grace_period_end"]).date()
        if cycle.get("grace_period_end")
        else objective_end + timedelta(days=GRACE_PERIOD_DAYS)
    )
    return {"pms_start": pms_start, "objective_end": objective_end, "grace_end": grace_end}


def compute_freeze_dates_from_constants() -> dict:
    today = date.today()
    pms_start = date(today.year, PMS_START_MONTH, PMS_START_DAY)
    if today < pms_start:
        pms_start = date(today.year - 1, PMS_START_MONTH, PMS_START_DAY)
    objective_end = pms_start + relativedelta(months=OBJECTIVE_SETTING_MONTHS)
    grace_end     = objective_end + timedelta(days=GRACE_PERIOD_DAYS)
    return {"pms_start": pms_start, "objective_end": objective_end, "grace_end": grace_end}


# ─────────────────────────────────────────────────────────────────────────────
# STATUS & PERMISSION
# ─────────────────────────────────────────────────────────────────────────────

def get_freeze_status() -> str:
    """Returns 'open', 'grace', or 'frozen'."""
    today = date.today()
    cycle = get_active_pms_cycle()
    dates = compute_freeze_dates_from_cycle(cycle) if cycle else compute_freeze_dates_from_constants()
    if today >= dates["grace_end"]:
        return "frozen"
    if today >= dates["objective_end"]:
        return "grace"
    return "open"


def can_role_edit(level: int) -> bool:
    """Returns True if the given role level is allowed to edit right now."""
    status = get_freeze_status()
    if status == "frozen":
        return False
    if status == "grace" and level > 1:
        return False
    return True


def get_request_level() -> int:
    """Reads X-User-Level header; defaults to 1 (HQ Admin)."""
    return int(request.headers.get("X-User-Level", 1))


# ─────────────────────────────────────────────────────────────────────────────
# TEMPLATE CYCLE CHECK
# ─────────────────────────────────────────────────────────────────────────────

def is_template_from_past_cycle(template_id: int) -> bool:
    try:
        result = (
            supabase.table("templates")
            .select("pms_cycle_id")
            .eq("id", template_id)
            .single()
            .execute()
        )
        if not result.data:
            return False
        t_cycle_id = result.data.get("pms_cycle_id")
        if not t_cycle_id:
            return False
        active = get_active_pms_cycle()
        if not active:
            return False
        return int(t_cycle_id) != int(active["id"])
    except Exception:
        return False
