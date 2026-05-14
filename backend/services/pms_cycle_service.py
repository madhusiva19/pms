"""
services/pms_cycle_service.py

Business logic for PMS cycle CRUD operations.

Responsibilities:
    - Fetching all cycles and the currently active cycle
    - Creating new cycles and seeding initial data
    - Closing the active cycle and opening the next one
    - Providing freeze-status debug information
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
    compute_freeze_dates_from_constants,
    compute_freeze_dates_from_cycle,
    get_active_pms_cycle,
    get_freeze_status,
)


# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

SOURCE_CONSTANTS = "constants"
SOURCE_DATABASE  = "database"
STATUS_ACTIVE    = True
STATUS_INACTIVE  = False


# ─────────────────────────────────────────────────────────────────────────────
# INTERNAL HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _compute_cycle_dates(year: int) -> tuple[date, date, date]:
    """
    Derive the three key dates for a PMS cycle from a given year.

    """
    pms_start     = date(year, PMS_START_MONTH, PMS_START_DAY)
    objective_end = pms_start + relativedelta(months=OBJECTIVE_SETTING_MONTHS)
    grace_end     = objective_end + timedelta(days=GRACE_PERIOD_DAYS)
    return pms_start, objective_end, grace_end


def _build_cycle_insert_payload(year: int, pms_start: date, objective_end: date,
                                grace_end: date, data: dict) -> dict:
    """
    Build the database insert payload for a new PMS cycle record.

    """
    return {
        "pms_year":              year,
        "pms_start":             pms_start.isoformat(),
        "objective_setting_end": objective_end.isoformat(),
        "grace_period_end":      grace_end.isoformat(),
        "mid_year_review":       data.get("mid_year_review"),
        "year_end_review":       data.get("year_end_review"),
        "is_active":             STATUS_ACTIVE,
        "created_at":            datetime.now().isoformat(),
    }


def _deactivate_current_cycle() -> None:
    """Mark all currently active PMS cycles as inactive."""
    supabase.table("pms_cycles").update({"is_active": STATUS_INACTIVE}).eq("is_active", STATUS_ACTIVE).execute()


def _deactivate_cycle_by_id(cycle_id: int) -> None:
    """
    Mark a specific PMS cycle as inactive.

    """
    supabase.table("pms_cycles").update({"is_active": STATUS_INACTIVE}).eq("id", cycle_id).execute()


# ─────────────────────────────────────────────────────────────────────────────
# READ OPERATIONS
# ─────────────────────────────────────────────────────────────────────────────

def get_all_pms_cycles() -> list:
    """
    Fetch all PMS cycles ordered by year descending.

    """
    return (
        supabase.table("pms_cycles")
        .select("*")
        .order("pms_year", desc=True)
        .execute()
        .data
    )


def get_active_cycle_response() -> dict:
    """
    Build the full active-cycle response dict, including computed freeze dates
    and freeze status.

    Falls back to constants-derived dates when no cycle exists in the database.

    """
    cycle = get_active_pms_cycle()

    # No database cycle — derive dates entirely from module constants
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
            "is_active":             STATUS_ACTIVE,
            "freeze_status":         get_freeze_status(),
            "source":                SOURCE_CONSTANTS,
        }

    # Active cycle found — overlay computed dates onto the database record
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
    """
    Return diagnostic information about the current freeze state.

    """
    today = date.today()
    cycle = get_active_pms_cycle()

    # No database cycle — fall back to constants
    if not cycle:
        dates = compute_freeze_dates_from_constants()
        return {
            "today":         str(today),
            "cycle":         None,
            "source":        SOURCE_CONSTANTS,
            "pms_start":     str(dates["pms_start"]),
            "objective_end": str(dates["objective_end"]),
            "grace_end":     str(dates["grace_end"]),
            "freeze_status": get_freeze_status(),
        }

    dates = compute_freeze_dates_from_cycle(cycle)
    return {
        "today":                  str(today),
        "source":                 SOURCE_DATABASE,
        "active_cycle_id":        cycle["id"],
        "active_cycle_year":      cycle["pms_year"],
        "computed_objective_end": str(dates["objective_end"]),
        "computed_grace_end":     str(dates["grace_end"]),
        "freeze_status":          get_freeze_status(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# WRITE OPERATIONS
# ─────────────────────────────────────────────────────────────────────────────

def update_pms_cycle(cycle_id: int, data: dict) -> None:
    """
    Partially update a PMS cycle's review and grace-period dates.

    """
    updatable_fields = ["mid_year_review", "year_end_review", "grace_period_end", "objective_setting_end"]
    payload          = {field: data[field] for field in updatable_fields if data.get(field)}

    if payload:
        supabase.table("pms_cycles").update(payload).eq("id", cycle_id).execute()


def create_pms_cycle(data: dict, seed_fn) -> dict:
    """
    Create a new PMS cycle for the specified year and seed it with initial data.

    Deactivates any currently active cycle before inserting the new one.

    """
    year = data.get("pms_year")
    if not year:
        raise ValueError("pms_year is required")

    pms_start, objective_end, grace_end = _compute_cycle_dates(int(year))

    # Deactivate existing active cycle before creating the new one
    _deactivate_current_cycle()

    payload = _build_cycle_insert_payload(int(year), pms_start, objective_end, grace_end, data)
    result  = supabase.table("pms_cycles").insert(payload).execute()

    if result.data:
        seed_fn(result.data[0])

    return result.data[0]


def close_active_pms_cycle() -> dict:
    """
    Mark the currently active PMS cycle as inactive (closed).

    """
    cycle = get_active_pms_cycle()
    if not cycle:
        raise LookupError("No active PMS cycle found.")

    _deactivate_cycle_by_id(cycle["id"])
    return cycle


def open_next_pms_cycle(data: dict, seed_fn) -> dict:
    """
    Close the current cycle and open a new one for the following year.

    If no active cycle exists, defaults to the current calendar year.

    """
    current   = get_active_pms_cycle()
    next_year = int(current["pms_year"]) + 1 if current else date.today().year

    # Close the current cycle before opening the next
    if current:
        _deactivate_cycle_by_id(current["id"])

    pms_start, objective_end, grace_end = _compute_cycle_dates(next_year)

    payload = _build_cycle_insert_payload(next_year, pms_start, objective_end, grace_end, data)
    result  = supabase.table("pms_cycles").insert(payload).execute()

    if result.data:
        seed_fn(result.data[0])

    return result.data[0]

