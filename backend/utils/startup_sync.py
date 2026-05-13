"""
utils/startup_sync.py

Functions that run once at startup to ensure the pms_cycles table is
consistent with the constants defined in models/constants.py.
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


# ─────────────────────────────────────────────────────────────────────────────
# INTERNAL HELPERS  (not exported)
# ─────────────────────────────────────────────────────────────────────────────

def _create_cycle_from_constants(seed_fn) -> None:
    today     = date.today()
    year      = today.year
    pms_start = date(year, PMS_START_MONTH, PMS_START_DAY)
    if today < pms_start:
        pms_start = date(year - 1, PMS_START_MONTH, PMS_START_DAY)
    objective_end = pms_start + relativedelta(months=OBJECTIVE_SETTING_MONTHS)
    grace_end     = objective_end + timedelta(days=GRACE_PERIOD_DAYS)
    result = supabase.table("pms_cycles").insert({
        "pms_year":              pms_start.year,
        "pms_start":             pms_start.isoformat(),
        "objective_setting_end": objective_end.isoformat(),
        "grace_period_end":      grace_end.isoformat(),
        "is_active":             True,
        "created_at":            datetime.now().isoformat(),
    }).execute()
    print(f"✅ sync: created new cycle {pms_start.year} from constants.")
    if result.data:
        seed_fn(result.data[0])


def _maybe_rollover_cycle(cycle: dict, seed_fn) -> None:
    try:
        grace_end_str = cycle.get("grace_period_end") or cycle.get("grace_end")
        if not grace_end_str:
            return
        grace_end = datetime.fromisoformat(grace_end_str).date()
        today     = date.today()

        obj_end_str = cycle.get("objective_setting_end")
        if obj_end_str and today <= datetime.fromisoformat(obj_end_str).date():
            return
        if today <= grace_end:
            return

        pms_start     = datetime.fromisoformat(cycle["pms_start"]).date()
        objective_end = datetime.fromisoformat(cycle["objective_setting_end"]).date()
        obj_months    = (
            (objective_end.year - pms_start.year) * 12
            + (objective_end.month - pms_start.month)
        )
        grace_days     = (grace_end - objective_end).days
        next_start     = date(pms_start.year + 1, pms_start.month, pms_start.day)
        next_obj_end   = next_start + relativedelta(months=obj_months)
        next_grace_end = next_obj_end + timedelta(days=grace_days)

        if supabase.table("pms_cycles").select("id").eq("pms_year", next_start.year).execute().data:
            return

        supabase.table("pms_cycles").update({"is_active": False}).eq("id", cycle["id"]).execute()
        new_result = supabase.table("pms_cycles").insert({
            "pms_year":              next_start.year,
            "pms_start":             next_start.isoformat(),
            "objective_setting_end": next_obj_end.isoformat(),
            "grace_period_end":      next_grace_end.isoformat(),
            "is_active":             True,
            "created_at":            datetime.now().isoformat(),
        }).execute()
        print(f"✅ rollover: created cycle {next_start.year}")
        if new_result.data:
            seed_fn(new_result.data[0])
    except Exception as error:
        print(f"❌ _maybe_rollover_cycle failed: {error}")


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC FUNCTIONS  (called from app.py on startup)
# ─────────────────────────────────────────────────────────────────────────────

def fix_duplicate_active_cycles() -> None:
    """Ensure only the most-recent cycle is marked active."""
    try:
        result = (
            supabase.table("pms_cycles")
            .select("*")
            .eq("is_active", True)
            .order("pms_year", desc=True)
            .execute()
        )
        active_cycles = result.data or []
        if len(active_cycles) <= 1:
            return
        keep   = active_cycles[0]
        to_fix = [c["id"] for c in active_cycles[1:]]
        supabase.table("pms_cycles").update({"is_active": False}).in_("id", to_fix).execute()
        print(
            f"⚠️  fix_duplicate_active_cycles: deactivated {len(to_fix)} duplicate(s),"
            f" keeping id={keep['id']}"
        )
    except Exception as error:
        print(f"❌ fix_duplicate_active_cycles failed: {error}")


def sync_cycle_dates_from_constants(seed_fn) -> None:
    """
    Make sure the active cycle has objective_setting_end and grace_period_end.
    If none exists, create one from constants. Then check for rollover.
    """
    try:
        result = (
            supabase.table("pms_cycles")
            .select("*")
            .eq("is_active", True)
            .order("pms_year", desc=True)
            .limit(1)
            .execute()
        )
        if not result.data:
            _create_cycle_from_constants(seed_fn)
            return

        cycle = result.data[0]
        if bool(cycle.get("objective_setting_end")) and bool(cycle.get("grace_period_end")):
            print(f"✅ sync: cycle {cycle['pms_year']} already has dates — skipping overwrite.")
            _maybe_rollover_cycle(cycle, seed_fn)
            return

        pms_start     = datetime.fromisoformat(cycle["pms_start"]).date()
        objective_end = pms_start + relativedelta(months=OBJECTIVE_SETTING_MONTHS)
        grace_end     = objective_end + timedelta(days=GRACE_PERIOD_DAYS)
        supabase.table("pms_cycles").update({
            "objective_setting_end": objective_end.isoformat(),
            "grace_period_end":      grace_end.isoformat(),
        }).eq("id", cycle["id"]).execute()
        _maybe_rollover_cycle(
            {**cycle,
             "objective_setting_end": objective_end.isoformat(),
             "grace_period_end":      grace_end.isoformat()},
            seed_fn,
        )
    except Exception as error:
        print(f"❌ sync_cycle_dates_from_constants failed: {error}")
