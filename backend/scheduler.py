"""
scheduler.py
-------------
APScheduler-based background job runner.

Jobs
----
1. auto_open_rating_window   — Runs daily at 00:01.
   Checks pms_cycles table for mid_year_review and year_end_review dates.
   The day after mid_year_review → H1 rating window opens.
   The day after year_end_review → H2 rating window opens.
   Automatically upserts the global rating_periods row.

2. deadline_warning_job      — Runs daily at 08:00.
   3 days before each open window closes, broadcasts deadline_warning
   notifications to all evaluators with pending ratings.

3. auto_close_rating_window  — Runs daily at 00:01.
   The day after a window closes, broadcasts period_closed notifications
   to managers of evaluators who still have outstanding ratings.

Business calendar (derived from pms_cycles)
--------------------------------------------
  H1  Performance: pms_start → mid_year_review
      Rating window: mid_year_review + 1 day, for WINDOW_DAYS days

  H2  Performance: mid_year_review + 1 day → year_end_review
      Rating window: year_end_review + 1 day, for WINDOW_DAYS days

These defaults can always be overridden via the Edit Period UI.

Setup
-----
pip install apscheduler
"""

from __future__ import annotations

import logging
from datetime import date, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron        import CronTrigger

from utils.db import supabase

log = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────
# Default rating window length in days (Jan 1–15 = 15 days)
WINDOW_DAYS = 15

# How many days before window end to send deadline warning
WARNING_DAYS_BEFORE = 3


# ══════════════════════════════════════════════════════════════════
# Helpers
# ══════════════════════════════════════════════════════════════════

def _upsert_global_period(pms_year: int, period: str,
                           start: date, end: date) -> None:
    """
    Upsert the global (all-NULL org-unit) rating_periods row.
    This is the fallback row that all users inherit unless they have
    a more specific country/branch/dept/sub-dept override.
    """
    row = {
        "pms_year":          pms_year,
        "period":            period,
        "rating_start":      start.isoformat(),
        "rating_end":        end.isoformat(),
        "is_active":         True,
        "country_id":        None,
        "branch_id":         None,
        "department_id":     None,
        "sub_department_id": None,
    }
    supabase.table("rating_periods").upsert(
        row,
        on_conflict=(
            "pms_year,period,"
            "country_id,branch_id,department_id,sub_department_id"
        ),
    ).execute()
    log.info(
        "[scheduler] Upserted global rating period: "
        "%s %s  %s → %s", period, pms_year, start, end
    )


def _get_active_period_row(pms_year: int, period: str) -> dict | None:
    """Fetch the global row for a given (pms_year, period)."""
    res = (
        supabase.table("rating_periods")
        .select("*")
        .eq("pms_year", pms_year)
        .eq("period", period)
        .is_("country_id", "null")
        .is_("branch_id", "null")
        .is_("department_id", "null")
        .is_("sub_department_id", "null")
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def _broadcast(notif_type: str, period: str, pms_year: int) -> None:
    """Call the notification service broadcast function."""
    try:
        from services.notification_service import broadcast_notifications
        count = broadcast_notifications(notif_type, period, pms_year)
        log.info(
            "[scheduler] Broadcast '%s' for %s %s — %d notifications sent",
            notif_type, period, pms_year, count,
        )
    except Exception as exc:
        log.error("[scheduler] Broadcast failed: %s", exc)


# ══════════════════════════════════════════════════════════════════
# Business calendar helpers
# ══════════════════════════════════════════════════════════════════

def _resolve_window_for_today(today: date) -> tuple[int, str, date, date] | None:
    """
    Given today's date, return (pms_year, period, window_start, window_end)
    if today is the first day of a rating window, else None.

    Derived from pms_cycles table instead of hardcoded Jan 1 / Jul 1:
      H1 rating window opens the day after mid_year_review
      H2 rating window opens the day after year_end_review

    This means if dates shift year to year, rating windows auto-adjust.
    """
    try:
        # Fetch all pms_cycles (active or not) to find whose window opens today
        cycles_res = (
            supabase.table("pms_cycles")
            .select("id, pms_year, mid_year_review, year_end_review")
            .execute()
        )
        cycles = cycles_res.data or []

        for cycle in cycles:
            pms_year = cycle["pms_year"]
            mid      = cycle.get("mid_year_review")
            yr_end   = cycle.get("year_end_review")

            if mid:
                # H1 window opens day after mid_year_review
                h1_start = date.fromisoformat(str(mid)[:10]) + timedelta(days=1)
                if today == h1_start:
                    h1_end = h1_start + timedelta(days=WINDOW_DAYS - 1)
                    return pms_year, "H1", h1_start, h1_end

            if yr_end:
                # H2 window opens day after year_end_review
                h2_start = date.fromisoformat(str(yr_end)[:10]) + timedelta(days=1)
                if today == h2_start:
                    h2_end = h2_start + timedelta(days=WINDOW_DAYS - 1)
                    return pms_year, "H2", h2_start, h2_end

    except Exception as exc:
        log.error("[scheduler] _resolve_window_for_today failed: %s", exc)

    return None


def _get_currently_open_windows(today: date) -> list[tuple[int, str]]:
    """
    Return list of (pms_year, period) for all global rows whose window
    is currently open (rating_start <= today <= rating_end).
    """
    res = (
        supabase.table("rating_periods")
        .select("pms_year, period, rating_start, rating_end")
        .eq("is_active", True)
        .is_("country_id", "null")
        .is_("branch_id", "null")
        .is_("department_id", "null")
        .is_("sub_department_id", "null")
        .execute()
    )
    open_windows = []
    for rp in res.data or []:
        try:
            s = date.fromisoformat(str(rp["rating_start"])[:10])
            e = date.fromisoformat(str(rp["rating_end"])[:10])
            if s <= today <= e:
                open_windows.append((int(rp["pms_year"]), rp["period"]))
        except (ValueError, TypeError):
            continue
    return open_windows


def _get_windows_closing_in(days: int, today: date) -> list[tuple[int, str]]:
    """
    Return global rows whose window closes exactly `days` days from today.
    """
    target_end = today + timedelta(days=days)
    res = (
        supabase.table("rating_periods")
        .select("pms_year, period, rating_end")
        .eq("is_active", True)
        .eq("rating_end", target_end.isoformat())
        .is_("country_id", "null")
        .is_("branch_id", "null")
        .is_("department_id", "null")
        .is_("sub_department_id", "null")
        .execute()
    )
    return [(int(rp["pms_year"]), rp["period"]) for rp in (res.data or [])]


def _get_windows_closed_yesterday(today: date) -> list[tuple[int, str]]:
    """
    Return global rows whose window ended yesterday (just closed).
    """
    yesterday = today - timedelta(days=1)
    res = (
        supabase.table("rating_periods")
        .select("pms_year, period, rating_end")
        .eq("is_active", True)
        .eq("rating_end", yesterday.isoformat())
        .is_("country_id", "null")
        .is_("branch_id", "null")
        .is_("department_id", "null")
        .is_("sub_department_id", "null")
        .execute()
    )
    return [(int(rp["pms_year"]), rp["period"]) for rp in (res.data or [])]


# ══════════════════════════════════════════════════════════════════
# Scheduled jobs
# ══════════════════════════════════════════════════════════════════

def auto_open_rating_window() -> None:
    """
    Job 1 — runs daily at 00:01.

    If today is Jan 1 or Jul 1, automatically upserts the global
    rating_periods row for the corresponding period and broadcasts
    the period_opened notification to all evaluators.

    HQ/Country admins can still override dates via the Edit Period UI
    after this auto-open — the upsert will simply update the row again.
    """
    today = date.today()
    result = _resolve_window_for_today(today)

    if result is None:
        return  # Not a window-open day

    pms_year, period, window_start, window_end = result
    log.info(
        "[scheduler] auto_open_rating_window: %s %s  %s → %s",
        period, pms_year, window_start, window_end,
    )

    # Check if a row already exists with custom dates (admin pre-configured it)
    existing = _get_active_period_row(pms_year, period)
    if existing:
        existing_start = date.fromisoformat(str(existing["rating_start"])[:10])
        if existing_start == window_start:
            log.info(
                "[scheduler] Global row for %s %s already set to correct dates — skipping upsert.",
                period, pms_year,
            )
        else:
            log.info(
                "[scheduler] Global row for %s %s has custom dates (%s → %s) — respecting admin override, skipping auto-upsert.",
                period, pms_year,
                existing["rating_start"], existing["rating_end"],
            )
        # Either way, still broadcast period_opened if not already sent
    else:
        # No row exists yet — create it
        _upsert_global_period(pms_year, period, window_start, window_end)

    # Broadcast period_opened (the broadcast endpoint is idempotent —
    # it checks for existing period_opened notifications before inserting)
    _broadcast("period_opened", period, pms_year)


def deadline_warning_job() -> None:
    """
    Job 2 — runs daily at 08:00.

    For any open window closing in exactly WARNING_DAYS_BEFORE days,
    broadcast deadline_warning notifications to evaluators with pending ratings.
    """
    today   = date.today()
    closing = _get_windows_closing_in(WARNING_DAYS_BEFORE, today)

    for pms_year, period in closing:
        log.info(
            "[scheduler] deadline_warning_job: %s %s closes in %d days",
            period, pms_year, WARNING_DAYS_BEFORE,
        )
        _broadcast("deadline_warning", period, pms_year)


def auto_close_rating_window() -> None:
    """
    Job 3 — runs daily at 00:01.

    The day after a window closes, broadcast period_closed notifications
    to managers of evaluators who still have outstanding ratings.
    """
    today  = date.today()
    closed = _get_windows_closed_yesterday(today)

    for pms_year, period in closed:
        log.info(
            "[scheduler] auto_close_rating_window: %s %s closed yesterday",
            period, pms_year,
        )
        _broadcast("period_closed", period, pms_year)


# ══════════════════════════════════════════════════════════════════
# Scheduler setup
# ══════════════════════════════════════════════════════════════════

def catchup_rating_window() -> None:
    """
    Runs once on Flask startup to catch up any missed rating window triggers.

    Checks pms_cycles for any window that should currently be open
    (mid_year_review + 1 day <= today <= mid_year_review + WINDOW_DAYS)
    or (year_end_review + 1 day <= today <= year_end_review + WINDOW_DAYS)
    but has no open rating_periods row yet — and opens it.

    This handles cases where the server was down or the daily trigger was missed.
    """
    try:
        today = date.today()
        log.info("[scheduler] catchup_rating_window: checking for missed triggers on %s", today)

        cycles_res = (
            supabase.table("pms_cycles")
            .select("id, pms_year, mid_year_review, year_end_review")
            .execute()
        )
        cycles = cycles_res.data or []

        for cycle in cycles:
            pms_year = cycle["pms_year"]
            mid      = cycle.get("mid_year_review")
            yr_end   = cycle.get("year_end_review")

            # Check H1 window — always sync dates from pms_cycles
            if mid:
                h1_start = date.fromisoformat(str(mid)[:10]) + timedelta(days=1)
                h1_end   = h1_start + timedelta(days=WINDOW_DAYS - 1)
                # Open if today is within window OR update existing row to match new dates
                if h1_start <= today <= h1_end:
                    log.info("[scheduler] catchup: syncing H1 window for pms_year=%s (%s→%s)", pms_year, h1_start, h1_end)
                    _upsert_global_period(pms_year, "H1", h1_start, h1_end)
                else:
                    # Outside window — update dates but keep closed if already closed
                    try:
                        existing = (
                            supabase.table("rating_periods")
                            .select("id, is_active, rating_start, rating_end")
                            .eq("pms_year", pms_year)
                            .eq("period", "H1")
                            .is_("country_id", "null")
                            .is_("branch_id", "null")
                            .limit(1)
                            .execute()
                        )
                        if existing.data:
                            row = existing.data[0]
                            # Only update dates if they don't match pms_cycles
                            if (str(row.get("rating_start", ""))[:10] != str(h1_start) or
                                str(row.get("rating_end", ""))[:10] != str(h1_end)):
                                supabase.table("rating_periods").update({
                                    "rating_start": h1_start.isoformat(),
                                    "rating_end":   h1_end.isoformat(),
                                }).eq("id", row["id"]).execute()
                                log.info("[scheduler] catchup: updated H1 dates for pms_year=%s", pms_year)
                    except Exception as e:
                        log.error("[scheduler] catchup H1 date sync failed: %s", e)

            # Check H2 window — always sync dates from pms_cycles
            if yr_end:
                h2_start = date.fromisoformat(str(yr_end)[:10]) + timedelta(days=1)
                h2_end   = h2_start + timedelta(days=WINDOW_DAYS - 1)
                if h2_start <= today <= h2_end:
                    log.info("[scheduler] catchup: syncing H2 window for pms_year=%s (%s→%s)", pms_year, h2_start, h2_end)
                    _upsert_global_period(pms_year, "H2", h2_start, h2_end)
                else:
                    try:
                        existing = (
                            supabase.table("rating_periods")
                            .select("id, is_active, rating_start, rating_end")
                            .eq("pms_year", pms_year)
                            .eq("period", "H2")
                            .is_("country_id", "null")
                            .is_("branch_id", "null")
                            .limit(1)
                            .execute()
                        )
                        if existing.data:
                            row = existing.data[0]
                            if (str(row.get("rating_start", ""))[:10] != str(h2_start) or
                                str(row.get("rating_end", ""))[:10] != str(h2_end)):
                                supabase.table("rating_periods").update({
                                    "rating_start": h2_start.isoformat(),
                                    "rating_end":   h2_end.isoformat(),
                                }).eq("id", row["id"]).execute()
                                log.info("[scheduler] catchup: updated H2 dates for pms_year=%s", pms_year)
                    except Exception as e:
                        log.error("[scheduler] catchup H2 date sync failed: %s", e)

    except Exception as exc:
        log.error("[scheduler] catchup_rating_window failed: %s", exc)


def init_scheduler() -> BackgroundScheduler:
    """
    Create, configure, and start the APScheduler instance.
    Call this once from app.py during startup.

    Returns the running scheduler so the caller can shut it down
    gracefully on app teardown if needed.
    """
    scheduler = BackgroundScheduler(timezone="UTC")

    # Job 1 & 3 — midnight checks (open window / close window)
    scheduler.add_job(
        func    = auto_open_rating_window,
        trigger = CronTrigger(hour=0, minute=1),
        id      = "auto_open_rating_window",
        name    = "Auto open rating window on Jan 1 / Jul 1",
        replace_existing = True,
    )

    scheduler.add_job(
        func    = auto_close_rating_window,
        trigger = CronTrigger(hour=0, minute=1),
        id      = "auto_close_rating_window",
        name    = "Broadcast period_closed the day after window ends",
        replace_existing = True,
    )

    # Job 2 — 08:00 daily deadline warning
    scheduler.add_job(
        func    = deadline_warning_job,
        trigger = CronTrigger(hour=8, minute=0),
        id      = "deadline_warning_job",
        name    = "Broadcast deadline warnings 3 days before close",
        replace_existing = True,
    )

    scheduler.start()
    log.info("[scheduler] APScheduler started — 3 jobs registered.")

    # Catch-up check — opens any missed rating windows on startup
    catchup_rating_window()

    return scheduler