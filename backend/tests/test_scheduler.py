"""
tests/test_scheduler.py
------------------------
Unit tests for scheduler.py background jobs.

Jobs covered
------------
- auto_open_rating_window   (Jan 1 / Jul 1 auto-open)
- deadline_warning_job      (3-day warning broadcast)
- auto_close_rating_window  (post-close broadcast)

Run with:
    pytest tests/test_scheduler.py -v

No real database or scheduler instance needed — all DB calls and
broadcast functions are mocked.
"""

import pytest
from datetime import date
from unittest.mock import MagicMock, patch, call


# ── Helper ────────────────────────────────────────────────────────

def _chain(data):
    result      = MagicMock()
    result.data = data
    chain       = MagicMock()
    chain.execute.return_value = result
    for method in ("select", "eq", "neq", "in_", "is_",
                   "order", "limit", "upsert", "update"):
        getattr(chain, method).return_value = chain
    return chain


# ══════════════════════════════════════════════════════════════════
# _resolve_window_for_today
# ══════════════════════════════════════════════════════════════════

class TestResolveWindowForToday:

    def test_jan_1_returns_h1_of_previous_business_year(self):
        from scheduler import _resolve_window_for_today
        result = _resolve_window_for_today(date(2026, 1, 1))
        assert result is not None
        pms_year, period, start, end = result
        assert pms_year == 2025       # Business year that started Jul 2025
        assert period   == "H1"
        assert start    == date(2026, 1, 1)
        assert end      == date(2026, 1, 15)

    def test_jul_1_returns_h2_of_previous_business_year(self):
        from scheduler import _resolve_window_for_today
        result = _resolve_window_for_today(date(2026, 7, 1))
        assert result is not None
        pms_year, period, start, end = result
        assert pms_year == 2025       # Business year that started Jul 2025
        assert period   == "H2"
        assert start    == date(2026, 7, 1)
        assert end      == date(2026, 7, 15)

    def test_non_window_day_returns_none(self):
        from scheduler import _resolve_window_for_today
        assert _resolve_window_for_today(date(2026, 5, 23)) is None
        assert _resolve_window_for_today(date(2026, 3, 15)) is None
        assert _resolve_window_for_today(date(2026, 12, 31)) is None

    def test_window_end_is_15_days_after_start(self):
        from scheduler import _resolve_window_for_today
        result = _resolve_window_for_today(date(2026, 1, 1))
        assert result is not None
        _, _, start, end = result
        assert (end - start).days == 14   # Jan 1 to Jan 15 = 14 days difference


# ══════════════════════════════════════════════════════════════════
# auto_open_rating_window
# ══════════════════════════════════════════════════════════════════

class TestAutoOpenRatingWindow:

    def test_does_nothing_on_non_window_day(self):
        """On a normal day (not Jan 1 or Jul 1), no DB calls are made."""
        with patch("scheduler.date") as mock_date:
            mock_date.today.return_value = date(2026, 5, 23)
            with patch("scheduler._resolve_window_for_today", return_value=None):
                with patch("scheduler._upsert_global_period") as mock_upsert:
                    with patch("scheduler._broadcast") as mock_broadcast:
                        from scheduler import auto_open_rating_window
                        auto_open_rating_window()

                        mock_upsert.assert_not_called()
                        mock_broadcast.assert_not_called()

    def test_upserts_global_row_on_jan_1_when_no_existing_row(self):
        """On Jan 1, if no row exists yet, upsert it and broadcast."""
        with patch("scheduler.date") as mock_date:
            mock_date.today.return_value = date(2026, 1, 1)
            with patch("scheduler._resolve_window_for_today",
                       return_value=(2025, "H1", date(2026, 1, 1), date(2026, 1, 15))):
                with patch("scheduler._get_active_period_row", return_value=None):
                    with patch("scheduler._upsert_global_period") as mock_upsert:
                        with patch("scheduler._broadcast") as mock_broadcast:
                            from scheduler import auto_open_rating_window
                            auto_open_rating_window()

                            mock_upsert.assert_called_once_with(
                                2025, "H1", date(2026, 1, 1), date(2026, 1, 15)
                            )
                            mock_broadcast.assert_called_once_with(
                                "period_opened", "H1", 2025
                            )

    def test_respects_admin_override_when_row_exists_with_different_dates(self):
        """If admin pre-configured different dates, skip auto-upsert but still broadcast."""
        existing_row = {
            "rating_start": "2026-01-01",
            "rating_end":   "2026-01-20",   # Admin extended to Jan 20
        }
        with patch("scheduler.date") as mock_date:
            mock_date.today.return_value = date(2026, 1, 1)
            with patch("scheduler._resolve_window_for_today",
                       return_value=(2025, "H1", date(2026, 1, 1), date(2026, 1, 15))):
                with patch("scheduler._get_active_period_row", return_value=existing_row):
                    with patch("scheduler._upsert_global_period") as mock_upsert:
                        with patch("scheduler._broadcast") as mock_broadcast:
                            from scheduler import auto_open_rating_window
                            auto_open_rating_window()

                            # Upsert skipped — admin override respected
                            mock_upsert.assert_not_called()
                            # Broadcast still sent
                            mock_broadcast.assert_called_once_with(
                                "period_opened", "H1", 2025
                            )

    def test_skips_upsert_when_row_already_has_correct_dates(self):
        """If row already has the correct auto-dates, no upsert needed."""
        existing_row = {
            "rating_start": "2026-01-01",
            "rating_end":   "2026-01-15",
        }
        with patch("scheduler.date") as mock_date:
            mock_date.today.return_value = date(2026, 1, 1)
            with patch("scheduler._resolve_window_for_today",
                       return_value=(2025, "H1", date(2026, 1, 1), date(2026, 1, 15))):
                with patch("scheduler._get_active_period_row", return_value=existing_row):
                    with patch("scheduler._upsert_global_period") as mock_upsert:
                        with patch("scheduler._broadcast"):
                            from scheduler import auto_open_rating_window
                            auto_open_rating_window()

                            mock_upsert.assert_not_called()


# ══════════════════════════════════════════════════════════════════
# deadline_warning_job
# ══════════════════════════════════════════════════════════════════

class TestDeadlineWarningJob:

    def test_broadcasts_warning_for_windows_closing_in_3_days(self):
        """When a window closes in 3 days, broadcast deadline_warning."""
        with patch("scheduler.date") as mock_date:
            mock_date.today.return_value = date(2026, 1, 12)
            with patch("scheduler._get_windows_closing_in",
                       return_value=[(2025, "H1")]):
                with patch("scheduler._broadcast") as mock_broadcast:
                    from scheduler import deadline_warning_job
                    deadline_warning_job()

                    mock_broadcast.assert_called_once_with(
                        "deadline_warning", "H1", 2025
                    )

    def test_does_nothing_when_no_windows_closing_soon(self):
        """No windows closing in 3 days → no broadcast."""
        with patch("scheduler.date") as mock_date:
            mock_date.today.return_value = date(2026, 1, 5)
            with patch("scheduler._get_windows_closing_in", return_value=[]):
                with patch("scheduler._broadcast") as mock_broadcast:
                    from scheduler import deadline_warning_job
                    deadline_warning_job()

                    mock_broadcast.assert_not_called()

    def test_broadcasts_for_multiple_open_windows(self):
        """Multiple windows closing on same day → broadcast for each."""
        with patch("scheduler.date") as mock_date:
            mock_date.today.return_value = date(2026, 1, 12)
            with patch("scheduler._get_windows_closing_in",
                       return_value=[(2025, "H1"), (2024, "H2")]):
                with patch("scheduler._broadcast") as mock_broadcast:
                    from scheduler import deadline_warning_job
                    deadline_warning_job()

                    assert mock_broadcast.call_count == 2


# ══════════════════════════════════════════════════════════════════
# auto_close_rating_window
# ══════════════════════════════════════════════════════════════════

class TestAutoCloseRatingWindow:

    def test_broadcasts_period_closed_for_windows_that_just_closed(self):
        """Windows that closed yesterday trigger period_closed broadcast."""
        with patch("scheduler.date") as mock_date:
            mock_date.today.return_value = date(2026, 1, 16)
            with patch("scheduler._get_windows_closed_yesterday",
                       return_value=[(2025, "H1")]):
                with patch("scheduler._broadcast") as mock_broadcast:
                    from scheduler import auto_close_rating_window
                    auto_close_rating_window()

                    mock_broadcast.assert_called_once_with(
                        "period_closed", "H1", 2025
                    )

    def test_does_nothing_when_no_windows_closed_yesterday(self):
        """No windows closed yesterday → no broadcast."""
        with patch("scheduler.date") as mock_date:
            mock_date.today.return_value = date(2026, 1, 5)
            with patch("scheduler._get_windows_closed_yesterday", return_value=[]):
                with patch("scheduler._broadcast") as mock_broadcast:
                    from scheduler import auto_close_rating_window
                    auto_close_rating_window()

                    mock_broadcast.assert_not_called()


# ══════════════════════════════════════════════════════════════════
# init_scheduler
# ══════════════════════════════════════════════════════════════════

class TestInitScheduler:

    def test_registers_three_jobs_and_starts(self):
        """init_scheduler registers exactly 3 jobs and starts the scheduler."""
        mock_scheduler = MagicMock()

        with patch("scheduler.BackgroundScheduler", return_value=mock_scheduler):
            from scheduler import init_scheduler
            result = init_scheduler()

            assert mock_scheduler.add_job.call_count == 3
            mock_scheduler.start.assert_called_once()
            assert result is mock_scheduler

    def test_job_ids_are_unique(self):
        """Each job is registered with a unique ID."""
        mock_scheduler = MagicMock()

        with patch("scheduler.BackgroundScheduler", return_value=mock_scheduler):
            from scheduler import init_scheduler
            init_scheduler()

            job_ids = [
                call.kwargs.get("id") or call.args[1]
                for call in mock_scheduler.add_job.call_args_list
                if call.kwargs.get("id")
            ]
            # All IDs should be unique
            assert len(job_ids) == len(set(job_ids))