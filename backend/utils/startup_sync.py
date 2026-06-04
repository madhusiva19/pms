"""
utils/startup_sync.py

Runs once on Flask startup.

POLICY:
  - NEVER creates a new PMS cycle automatically.
  - NEVER rolls over to next year on restart.
  - ONLY fixes duplicate active cycles (data integrity).
  - ONLY backfills missing date fields on existing active cycle.

  Rollover is handled by:
    Primary:  Supabase pg_cron → auto_rollover_pms_cycle() daily at 00:05
    Backup:   APScheduler     → auto_rollover_if_needed()  daily at 00:05
"""

from datetime import timedelta
from datetime import datetime
from dateutil.relativedelta import relativedelta

from models.supabase_client import supabase
from models.constants import (
    OBJECTIVE_SETTING_MONTHS,
    GRACE_PERIOD_DAYS,
)


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC FUNCTIONS  (called from app.py on startup)
# ─────────────────────────────────────────────────────────────────────────────

def fix_duplicate_active_cycles() -> None:
    """
    Ensure only the most-recent cycle is marked active.

    Data-integrity fix only.
    If somehow more than one cycle has is_active = True,
    keeps the newest one and deactivates the rest.
    Never creates or modifies cycle dates.
    """
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

        supabase.table("pms_cycles").update(
            {"is_active": False}
        ).in_("id", to_fix).execute()

        print(
            f"⚠️  fix_duplicate_active_cycles: deactivated {len(to_fix)} duplicate(s),"
            f" keeping id={keep['id']} pms_year={keep['pms_year']}"
        )

    except Exception as error:
        print(f"❌ fix_duplicate_active_cycles failed: {error}")


def sync_cycle_dates_from_constants(seed_fn=None) -> None:
    """
    Backfill ONLY missing date fields on the existing active cycle.

    Rules:
      - No active cycle      → log warning, do nothing
      - Has all date fields  → log success, do nothing
      - Missing date fields  → backfill from constants only
        (handles old DB records created before all columns existed)

    Will NEVER:
      - Create a new PMS cycle
      - Roll over to the next year
      - Seed notifications
      - Change is_active on any cycle
      - Overwrite existing date values
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

        # ── No active cycle ───────────────────────────────────────────────────
        if not result.data:
            print(
                "⚠️  sync: No active PMS cycle found in database. "
                "Rollover is handled by Supabase pg_cron or APScheduler. "
                "If this is a fresh setup, HQ Admin must create the first cycle."
            )
            return

        cycle = result.data[0]

        # ── All date fields already populated ────────────────────────────────
        if cycle.get("objective_setting_end") and cycle.get("grace_period_end"):
            print(
                f"✅ sync: cycle {cycle['pms_year']} already has all dates — "
                "no changes needed."
            )
            return

        # ── Backfill missing date fields from constants ───────────────────────
        pms_start     = datetime.fromisoformat(cycle["pms_start"]).date()
        objective_end = pms_start + relativedelta(months=OBJECTIVE_SETTING_MONTHS)
        grace_end     = objective_end + timedelta(days=GRACE_PERIOD_DAYS)

        update_payload = {}

        if not cycle.get("objective_setting_start"):
            update_payload["objective_setting_start"] = pms_start.isoformat()

        if not cycle.get("objective_setting_end"):
            update_payload["objective_setting_end"] = objective_end.isoformat()

        if not cycle.get("grace_period_end"):
            update_payload["grace_period_end"] = grace_end.isoformat()

        if update_payload:
            supabase.table("pms_cycles").update(
                update_payload
            ).eq("id", cycle["id"]).execute()
            print(
                f"✅ sync: backfilled missing dates for cycle "
                f"{cycle['pms_year']}: {list(update_payload.keys())}"
            )

    except Exception as error:
        print(f"❌ sync_cycle_dates_from_constants failed: {error}")