"""
tests/test_services.py
-----------------------
Unit tests for services/score_service.py and services/notification_service.py.

Run with:
    pytest tests/test_services.py -v

Supabase is mocked so no real DB calls are made.
"""

from unittest.mock import MagicMock, call, patch

import pytest


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_supabase():
    """Patch the shared Supabase client for all service modules."""
    with patch("utils.db.supabase") as mock_sb:
        yield mock_sb


def _chain(data):
    """
    Build a chainable mock whose terminal `.execute()` returns `.data = data`.
    """
    result      = MagicMock()
    result.data = data

    chain = MagicMock()
    chain.execute.return_value = result

    for method in ("select", "eq", "neq", "in_", "not_", "is_",
                   "order", "limit", "ilike", "update", "insert",
                   "delete", "upsert", "single"):
        getattr(chain, method).return_value = chain

    return chain


# ---------------------------------------------------------------------------
# score_service.get_active_period_params
# ---------------------------------------------------------------------------

class TestGetActivePeriodParams:
    """Tests for the active period resolver."""

    def test_returns_active_period_when_today_is_in_window(self, mock_supabase):
        from datetime import date

        # Simulate a period that spans today
        today_str = date.today().isoformat()

        fake_periods = [
            {
                "pms_year":     2025,
                "period":       "H1",
                "rating_start": "2025-01-01",
                "rating_end":   "2099-12-31",  # Far future so test always passes
            }
        ]
        mock_supabase.table.return_value = _chain(fake_periods)

        from services.score_service import get_active_period_params
        year, period = get_active_period_params()

        assert year   == 2025
        assert period == "H1"

    def test_falls_back_when_no_active_periods(self, mock_supabase):
        from datetime import date

        # No active periods at all → hard fallback
        mock_supabase.table.return_value = _chain([])

        from services.score_service import get_active_period_params
        year, period = get_active_period_params()

        assert year   == date.today().year
        assert period == "H1"


# ---------------------------------------------------------------------------
# score_service.patch_total_score
# ---------------------------------------------------------------------------

class TestPatchTotalScore:
    """Tests for the total score rollup utility."""

    def test_calculates_correct_total(self, mock_supabase):
        # Two score rows that should sum to 1.5
        fake_records = [
            {"score": 0.8},
            {"score": 0.7},
        ]

        # All three table calls (select, upsert x2) return the same chain
        mock_supabase.table.return_value = _chain(fake_records)

        from services.score_service import patch_total_score
        total = patch_total_score("user-1", 2025, "H1")

        assert total == 1.5

    def test_returns_zero_when_no_records(self, mock_supabase):
        mock_supabase.table.return_value = _chain([])

        from services.score_service import patch_total_score
        total = patch_total_score("user-1", 2025, "H1")

        assert total == 0.0


# ---------------------------------------------------------------------------
# notification_service.send_reminder
# ---------------------------------------------------------------------------

class TestSendReminder:
    """Tests for the one-to-one reminder sender."""

    def test_raises_value_error_when_recipient_not_found(self, mock_supabase):
        # Supabase returns no data → recipient does not exist
        no_data        = MagicMock()
        no_data.data   = None
        chain          = MagicMock()
        chain.execute.return_value = no_data

        for method in ("select", "eq", "single"):
            getattr(chain, method).return_value = chain

        mock_supabase.table.return_value = chain

        from services.notification_service import send_reminder

        with pytest.raises(ValueError, match="Recipient not found"):
            send_reminder("mgr-1", "emp-1", "H1", 2025, "Please rate.")

    def test_raises_permission_error_when_not_direct_manager(self, mock_supabase):
        # Recipient exists but has a different manager_id
        recipient_data = {
            "id":         "emp-1",
            "full_name":  "John",
            "manager_id": "someone-else",   # Not the sender
        }

        chain = _chain(recipient_data)
        mock_supabase.table.return_value = chain

        from services.notification_service import send_reminder

        with pytest.raises(PermissionError, match="not the direct manager"):
            send_reminder("mgr-1", "emp-1", "H1", 2025, "Please rate.")

    def test_inserts_notification_for_valid_sender(self, mock_supabase):
        # Recipient exists and sender IS the direct manager
        recipient_data = {
            "id":         "emp-1",
            "full_name":  "Jane",
            "manager_id": "mgr-1",   # Matches sender_id
        }
        sender_data = {"full_name": "Manager Bob"}

        call_count = [0]

        def table_side_effect(table_name):
            call_count[0] += 1
            if call_count[0] == 1:
                # First call: fetch recipient
                return _chain(recipient_data)
            elif call_count[0] == 2:
                # Second call: fetch sender
                return _chain(sender_data)
            else:
                # Third call: insert notification
                return _chain([])

        mock_supabase.table.side_effect = table_side_effect

        from services.notification_service import send_reminder

        result = send_reminder("mgr-1", "emp-1", "H1", 2025, "Hello!")

        assert result["success"] is True
