"""
tests/test_services.py
-----------------------
Unit tests for services/score_service.py and services/notification_service.py
Run with:  pytest tests/test_services.py -v
"""

from datetime import date
from unittest.mock import MagicMock
import pytest
import utils.db


# ── Helper ────────────────────────────────────────────────────────

def _chain(data):
    result      = MagicMock()
    result.data = data
    chain       = MagicMock()
    chain.execute.return_value = result
    for m in ("select","eq","neq","in_","not_","is_",
              "order","limit","single","update","insert","delete","upsert"):
        getattr(chain, m).return_value = chain
    return chain


@pytest.fixture(autouse=True)
def reset_mock():
    """Fully reset the mock before each test — clear both return_value and side_effect."""
    sb = utils.db.supabase
    sb.reset_mock()
    sb.table.side_effect  = None
    sb.table.return_value = MagicMock()
    yield


@pytest.fixture
def sb():
    import services.score_service as ss
    import services.notification_service as ns
    sb = utils.db.supabase
    ss.supabase = sb
    ns.supabase = sb
    return sb


# ══════════════════════════════════════════════════════════════════
# get_active_period_params
# ══════════════════════════════════════════════════════════════════

class TestGetActivePeriodParams:

    def test_returns_active_period_when_today_is_in_window(self, sb):
        import services.score_service as ss
        ss.supabase = sb
        sb.table.side_effect  = None
        sb.table.return_value = _chain([{
            "pms_year":     2025,
            "period":       "H1",
            "rating_start": "2025-01-01",
            "rating_end":   "2099-12-31",
        }])
        year, period = ss.get_active_period_params()
        assert year   == 2025
        assert period == "H1"

    def test_falls_back_when_no_active_periods(self, sb):
        import services.score_service as ss
        ss.supabase = sb
        sb.table.side_effect  = None
        sb.table.return_value = _chain([])
        year, period = ss.get_active_period_params()
        assert year == date.today().year
        expected = "H1" if date.today().month <= 6 else "H2"
        assert period == expected


# ══════════════════════════════════════════════════════════════════
# patch_total_score  — makes 3 DB calls:
#   1. SELECT performance_records
#   2. UPSERT performance_summaries
#   3. UPSERT evaluations
# ══════════════════════════════════════════════════════════════════

class TestPatchTotalScore:

    def test_calculates_correct_total(self, sb):
        import services.score_service as ss
        ss.supabase = sb
        # All 3 table calls return the same chain — only the first
        # call's .data matters (SELECT). Upserts don't use .data.
        sb.table.side_effect  = None
        sb.table.return_value = _chain([{"score": 0.8}, {"score": 0.7}])
        total = ss.patch_total_score(
            "00000000-0000-0000-0000-000000000001", 2025, "H1"
        )
        assert total == 1.5

    def test_returns_zero_when_no_records(self, sb):
        import services.score_service as ss
        ss.supabase = sb
        sb.table.side_effect  = None
        sb.table.return_value = _chain([])
        total = ss.patch_total_score(
            "00000000-0000-0000-0000-000000000001", 2025, "H1"
        )
        assert total == 0.0


# ══════════════════════════════════════════════════════════════════
# send_reminder  — returns {"success": True} not True
# ══════════════════════════════════════════════════════════════════

class TestSendReminder:

    def test_raises_value_error_when_recipient_not_found(self, sb):
        import services.notification_service as ns
        ns.supabase = sb
        # .single() query returns None data → recipient not found
        result      = MagicMock()
        result.data = None
        chain       = MagicMock()
        chain.execute.return_value = result
        for m in ("select","eq","single"):
            getattr(chain, m).return_value = chain
        sb.table.side_effect  = None
        sb.table.return_value = chain

        with pytest.raises(ValueError, match="Recipient not found"):
            ns.send_reminder(
                "00000000-0000-0000-0000-000000000001",
                "00000000-0000-0000-0000-000000000002",
                "H1", 2025, "Please rate."
            )

    def test_raises_permission_error_when_not_direct_manager(self, sb):
        import services.notification_service as ns
        ns.supabase = sb
        sb.table.side_effect  = None
        sb.table.return_value = _chain({
            "id":         "00000000-0000-0000-0000-000000000002",
            "full_name":  "John",
            "manager_id": "00000000-0000-0000-0000-000000000099",
        })

        with pytest.raises(PermissionError, match="not the direct manager"):
            ns.send_reminder(
                "00000000-0000-0000-0000-000000000001",
                "00000000-0000-0000-0000-000000000002",
                "H1", 2025, "Please rate."
            )

    def test_inserts_notification_for_valid_sender(self, sb):
        import services.notification_service as ns
        ns.supabase = sb
        call_count = [0]

        def side_effect(table_name):
            call_count[0] += 1
            if call_count[0] == 1:
                return _chain({
                    "id":         "00000000-0000-0000-0000-000000000002",
                    "full_name":  "Jane",
                    "manager_id": "00000000-0000-0000-0000-000000000001",
                })
            if call_count[0] == 2:
                return _chain({"full_name": "Manager Bob"})
            return _chain([])

        sb.table.side_effect = side_effect

        result = ns.send_reminder(
            "00000000-0000-0000-0000-000000000001",
            "00000000-0000-0000-0000-000000000002",
            "H1", 2025, "Hello!"
        )
        # send_reminder returns {"success": True}
        assert result == {"success": True}