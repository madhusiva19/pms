"""
services/score_service.py
--------------------------
Period resolution and total-score persistence.

Responsibilities
----------------
- Determine the currently active PMS period (year + H1/H2 label).
- After ratings are saved, roll up individual objective scores into the
  performance_summaries and evaluations tables so dashboards stay current.
"""

from datetime import date

from utils.db import supabase


# ---------------------------------------------------------------------------
# Active period resolution
# ---------------------------------------------------------------------------

def get_active_period_params() -> tuple[int, str]:
    """
    Return the ``(pms_year, period)`` tuple for the currently open rating
    window.

    Logic
    -----
    1. Fetch all active rating periods from the DB.
    2. If today falls inside a period's start–end window, return that period.
    3. If no window is open, return the most recently defined active period
       as a sensible fallback so the app never crashes.
    4. Hard fallback: current calendar year + "H1".
    """
    today = date.today()

    result = (
        supabase.table("rating_periods")
        .select("pms_year, period, rating_start, rating_end")
        .eq("is_active", True)
        .execute()
    )

    for rp in result.data or []:
        start = rp.get("rating_start")
        end   = rp.get("rating_end")

        if start and end:
            if (
                date.fromisoformat(str(start)[:10])
                <= today
                <= date.fromisoformat(str(end)[:10])
            ):
                return int(rp["pms_year"]), rp["period"]

    # Fallback: use the most recently defined period even if the window is closed
    if result.data:
        latest = sorted(
            result.data,
            key=lambda r: (r["pms_year"], r["period"]),
            reverse=True,
        )[0]
        return int(latest["pms_year"]), latest["period"]

    # Hard fallback when no active periods are configured at all
    return today.year, "H1"


# ---------------------------------------------------------------------------
# Total score persistence
# ---------------------------------------------------------------------------

def patch_total_score(user_id: str, year: int, period: str) -> float:
    """
    Recalculate and persist the user's total performance score for a given
    period.

    Steps
    -----
    1. Sum all ``score`` values in performance_records for this user/year/period.
    2. Upsert the total into ``performance_summaries``.
    3. Upsert the total into ``evaluations`` (marks the evaluation as completed).

    Returns
    -------
    float : The newly calculated total score (rounded to 2 decimal places).
    """
    records = (
        supabase.table("performance_records")
        .select("score")
        .eq("user_id", user_id)
        .eq("year", year)
        .eq("period", period)
        .execute()
        .data
        or []
    )

    total = round(sum(float(r.get("score") or 0) for r in records), 2)

    # Persist to the summary table used by dashboards
    supabase.table("performance_summaries").upsert(
        {
            "user_id":     user_id,
            "pms_year":    year,
            "period":      period,
            "total_score": total,
        },
        on_conflict="user_id,pms_year,period",
    ).execute()

    # Mark the evaluation record as completed with the overall score
    supabase.table("evaluations").upsert(
    {
        "employee_id":   user_id,
        "evaluator_id":  user_id,
        "period":        period,
        "year":          year,
        "overall_score": total,
        "status":        "completed",
    },
    on_conflict="employee_id,period,year",
    ).execute()

    return total