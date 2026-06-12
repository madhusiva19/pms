"""
services/freeze_service.py

All freeze-status logic.

POLICY:
  - No active cycle → freeze_status = "frozen" always.
  - Never falls back to constants for status determination.
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
    MID_YEAR_REVIEW_MONTH,
    MID_YEAR_REVIEW_DAY,
    YEAR_END_REVIEW_MONTH,
    YEAR_END_REVIEW_DAY,
)

from models.supabase_client import supabase


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

def compute_freeze_dates_from_cycle(cycle: dict) -> dict:
    pms_start = datetime.fromisoformat(cycle["pms_start"]).date()

    obj_start = (
        datetime.fromisoformat(cycle["objective_setting_start"]).date()
        if cycle.get("objective_setting_start")
        else pms_start
    )

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

    # ── NEW: review milestones ─────────────────────────────────────────────
    mid_year_review = (
        datetime.fromisoformat(cycle["mid_year_review"]).date()
        if cycle.get("mid_year_review")
        else date(pms_start.year, MID_YEAR_REVIEW_MONTH, MID_YEAR_REVIEW_DAY)
    )

    year_end_review = (
        datetime.fromisoformat(cycle["year_end_review"]).date()
        if cycle.get("year_end_review")
        else date(pms_start.year + 1, YEAR_END_REVIEW_MONTH, YEAR_END_REVIEW_DAY)
    )

    return {
        "pms_start":       pms_start,
        "obj_start":       obj_start,
        "objective_end":   objective_end,
        "grace_end":       grace_end,
        "mid_year_review": mid_year_review,   # NEW
        "year_end_review": year_end_review,   # NEW
    }

def compute_freeze_dates_from_constants() -> dict:
    """
    Utility helper for date calculation only.
    NOT used for freeze status — that returns 'frozen' when no cycle.
    """
    today     = date.today()
    pms_start = date(today.year, PMS_START_MONTH, PMS_START_DAY)
    if today < pms_start:
        pms_start = date(today.year - 1, PMS_START_MONTH, PMS_START_DAY)
    objective_end = pms_start + relativedelta(months=OBJECTIVE_SETTING_MONTHS)
    grace_end     = objective_end + timedelta(days=GRACE_PERIOD_DAYS)
    return {
        "pms_start":     pms_start,
        "objective_end": objective_end,
        "grace_end":     grace_end,
    }


def get_freeze_status() -> str:
    """
    Returns 'open', 'grace', or 'frozen'.
    No active cycle → always 'frozen'.
    """
    cycle = get_active_pms_cycle()
    if not cycle:
        return "frozen"

    today = date.today()
    dates = compute_freeze_dates_from_cycle(cycle)

    if today >= dates["grace_end"]:
        return "frozen"
    if today >= dates["objective_end"]:
        return "grace"
    return "open"


def can_role_edit(level: int) -> bool:
    status = get_freeze_status()
    if status == "frozen":
        return False
    if status == "grace" and level > 1:
        return False
    return True


def get_request_level() -> int:
    try:
        return int(request.headers.get("X-User-Level", 1))
    except (ValueError, TypeError):
        return 1


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