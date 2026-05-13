"""
services/pms_cycle_service.py

Business logic for PMS cycle CRUD operations.
"""

from datetime import date, timedelta
from datetime import datetime
from dateutil.relativedelta import relativedelta

from models.supabase_client import supabase
from models.constants import (
    OBJECTIVE_SETTING_MONTHS,
    GRACE_PERIOD_DAYS,
    PMS_START_MONTH,
    PMS_START_DAY,
)
from services.freeze_service import (
    get_active_pms_cycle,
    get_freeze_status,
    compute_freeze_dates_from_cycle,
    compute_freeze_dates_from_constants,
)


def get_all_pms_cycles() -> list:
    return supabase.table("pms_cycles").select("*").order("pms_year", desc=True).execute().data


def get_active_cycle_response() -> dict:
    cycle = get_active_pms_cycle()
    if not cycle:
        dates = compute_freeze_dates_from_constants()
        return {
            "id":                    None,
            "pms_year":              dates["pms_start"].year,
            "pms_start":             dates["pms_start"].isoformat(),
            "objective_end":         dates["objective_end"].isoformat(),
            "grace_end":             dates["grace_end"].isoformat(),
            "objective_setting_end": dates["objective_end"].isoformat(),
            "grace_period_end":      dates["grace_end"].isoformat(),
            "mid_year_review":       None,
            "year_end_review":       None,
            "is_active":             True,
            "freeze_status":         get_freeze_status(),
            "source":                "constants",
        }
    dates = compute_freeze_dates_from_cycle(cycle)
    return {
        **cycle,
        "objective_end":         dates["objective_end"].isoformat(),
        "grace_end":             dates["grace_end"].isoformat(),
        "objective_setting_end": dates["objective_end"].isoformat(),
        "grace_period_end":      dates["grace_end"].isoformat(),
        "freeze_status":         get_freeze_status(),
        "source":                "database",
    }


def update_pms_cycle(cycle_id: int, data: dict) -> None:
    fields  = ["mid_year_review", "year_end_review", "grace_period_end", "objective_setting_end"]
    payload = {f: data[f] for f in fields if data.get(f)}
    if payload:
        supabase.table("pms_cycles").update(payload).eq("id", cycle_id).execute()


def create_pms_cycle(data: dict, seed_fn) -> dict:
    year = data.get("pms_year")
    if not year:
        raise ValueError("pms_year is required")
    pms_start     = date(int(year), PMS_START_MONTH, PMS_START_DAY)
    objective_end = pms_start + relativedelta(months=OBJECTIVE_SETTING_MONTHS)
    grace_end     = objective_end + timedelta(days=GRACE_PERIOD_DAYS)
    supabase.table("pms_cycles").update({"is_active": False}).eq("is_active", True).execute()
    result = supabase.table("pms_cycles").insert({
        "pms_year":              int(year),
        "pms_start":             pms_start.isoformat(),
        "objective_setting_end": objective_end.isoformat(),
        "grace_period_end":      grace_end.isoformat(),
        "mid_year_review":       data.get("mid_year_review"),
        "year_end_review":       data.get("year_end_review"),
        "is_active":             True,
        "created_at":            datetime.now().isoformat(),
    }).execute()
    if result.data:
        seed_fn(result.data[0])
    return result.data[0]


def close_active_pms_cycle() -> dict:
    cycle = get_active_pms_cycle()
    if not cycle:
        raise LookupError("No active PMS cycle found.")
    supabase.table("pms_cycles").update({"is_active": False}).eq("id", cycle["id"]).execute()
    return cycle


def open_next_pms_cycle(data: dict, seed_fn) -> dict:
    current   = get_active_pms_cycle()
    next_year = int(current["pms_year"]) + 1 if current else date.today().year
    if current:
        supabase.table("pms_cycles").update({"is_active": False}).eq("id", current["id"]).execute()
    pms_start     = date(next_year, PMS_START_MONTH, PMS_START_DAY)
    objective_end = pms_start + relativedelta(months=OBJECTIVE_SETTING_MONTHS)
    grace_end     = objective_end + timedelta(days=GRACE_PERIOD_DAYS)
    result = supabase.table("pms_cycles").insert({
        "pms_year":              next_year,
        "pms_start":             pms_start.isoformat(),
        "objective_setting_end": objective_end.isoformat(),
        "grace_period_end":      grace_end.isoformat(),
        "mid_year_review":       data.get("mid_year_review"),
        "year_end_review":       data.get("year_end_review"),
        "is_active":             True,
        "created_at":            datetime.now().isoformat(),
    }).execute()
    if result.data:
        seed_fn(result.data[0])
    return result.data[0]


def get_debug_freeze_info() -> dict:
    today = date.today()
    cycle = get_active_pms_cycle()
    if not cycle:
        dates = compute_freeze_dates_from_constants()
        return {
            "today":         str(today),
            "cycle":         None,
            "source":        "constants",
            "pms_start":     str(dates["pms_start"]),
            "objective_end": str(dates["objective_end"]),
            "grace_end":     str(dates["grace_end"]),
            "freeze_status": get_freeze_status(),
        }
    dates = compute_freeze_dates_from_cycle(cycle)
    return {
        "today":                   str(today),
        "source":                  "database",
        "active_cycle_id":         cycle["id"],
        "active_cycle_year":       cycle["pms_year"],
        "computed_objective_end":  str(dates["objective_end"]),
        "computed_grace_end":      str(dates["grace_end"]),
        "freeze_status":           get_freeze_status(),
    }
