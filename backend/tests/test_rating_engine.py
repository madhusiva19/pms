"""
tests/test_rating_engine.py
-----------------------------
Unit tests for services/rating_engine.py.

Run with:
    pytest tests/test_rating_engine.py -v

These tests are fully isolated — no Supabase connection is needed.
All inputs are plain Python dicts passed directly to the pure functions.
"""

import pytest

from services.rating_engine import (
    calculate_rating,
    compute_achievement_pct,
    compute_bracket_rating,
    compute_interpolated_rating,
)


# ---------------------------------------------------------------------------
# compute_interpolated_rating
# ---------------------------------------------------------------------------

class TestComputeInterpolatedRating:
    """Tests for linear interpolation between lower and upper limits."""

    def test_value_at_lower_limit_returns_one(self):
        # Exactly at the lower boundary → minimum rating
        assert compute_interpolated_rating(90.0, ll=90.0, ul=110.0) == 1.0

    def test_value_below_lower_limit_returns_one(self):
        # Below the lower boundary → still capped at 1.0
        assert compute_interpolated_rating(50.0, ll=90.0, ul=110.0) == 1.0

    def test_value_at_upper_limit_returns_five(self):
        # Exactly at the upper boundary → maximum rating
        assert compute_interpolated_rating(110.0, ll=90.0, ul=110.0) == 5.0

    def test_value_above_upper_limit_returns_five(self):
        # Above the upper boundary → still capped at 5.0
        assert compute_interpolated_rating(150.0, ll=90.0, ul=110.0) == 5.0

    def test_midpoint_returns_three(self):
        # Mid-point between ll and ul should give exactly 3.0
        assert compute_interpolated_rating(100.0, ll=90.0, ul=110.0) == 3.0

    def test_quarter_point_returns_two(self):
        # 25 % of the way from ll to ul → rating 2.0
        assert compute_interpolated_rating(95.0, ll=90.0, ul=110.0) == 2.0

    def test_result_is_rounded_to_four_decimal_places(self):
        result = compute_interpolated_rating(91.0, ll=90.0, ul=110.0)
        # Result should not have more than 4 decimal places
        assert round(result, 4) == result


# ---------------------------------------------------------------------------
# compute_bracket_rating
# ---------------------------------------------------------------------------

class TestComputeBracketRating:
    """Tests for bracket-table rating lookup."""

    # Typical bracket table: ≤50 → 1, ≤70 → 2, ≤85 → 3, ≤95 → 4, None → 5
    RULES = [
        {"max_val": 50,   "rating": 1.0},
        {"max_val": 70,   "rating": 2.0},
        {"max_val": 85,   "rating": 3.0},
        {"max_val": 95,   "rating": 4.0},
        {"max_val": None, "rating": 5.0},
    ]

    def test_value_in_first_bracket(self):
        assert compute_bracket_rating(40.0, self.RULES, inverse=False) == 1.0

    def test_value_at_bracket_boundary(self):
        # Boundary values should match the enclosing bracket (≤50)
        assert compute_bracket_rating(50.0, self.RULES, inverse=False) == 1.0

    def test_value_in_middle_bracket(self):
        assert compute_bracket_rating(80.0, self.RULES, inverse=False) == 3.0

    def test_value_above_all_max_vals_uses_open_bracket(self):
        # Any value above the last explicit ceiling → open-ended top bracket
        assert compute_bracket_rating(200.0, self.RULES, inverse=False) == 5.0

    def test_single_open_ended_rule(self):
        # Edge case: only one rule with no ceiling
        rules = [{"max_val": None, "rating": 3.0}]
        assert compute_bracket_rating(999.0, rules, inverse=False) == 3.0


# ---------------------------------------------------------------------------
# calculate_rating — dispatch tests
# ---------------------------------------------------------------------------

class TestCalculateRating:
    """Integration-style tests for the main calculate_rating dispatcher."""

    def test_manual_scale_returns_manual_rating(self):
        record  = {"manual_rating": 4.0, "actual": None, "target": None}
        mapping = {"scale_type": "manual"}
        assert calculate_rating(record, mapping, bracket_rules=[]) == 4.0

    def test_manual_scale_defaults_to_one_when_none(self):
        record  = {"manual_rating": None, "actual": None, "target": None}
        mapping = {"scale_type": "manual"}
        assert calculate_rating(record, mapping, bracket_rules=[]) == 1.0

    def test_interpolated_achievement_pct_input(self):
        # actual=100, target=100 → achievement 100 % → mid-point rating 3.0
        record  = {"actual": 100.0, "target": 100.0, "manual_rating": None}
        mapping = {
            "scale_type": "interpolated",
            "input_type": "achievement_pct",
            "ll":         90.0,
            "ul":         110.0,
            "inverse":    False,
        }
        assert calculate_rating(record, mapping, bracket_rules=[]) == 3.0

    def test_interpolated_raw_actual_x100_input(self):
        # actual=0.15 → value = 15 % → interpolated between ll=4, ul=15
        record  = {"actual": 0.15, "target": None, "manual_rating": None}
        mapping = {
            "scale_type": "interpolated",
            "input_type": "raw_actual_x100",
            "ll":         4.0,
            "ul":         15.0,
            "inverse":    False,
        }
        result = calculate_rating(record, mapping, bracket_rules=[])
        assert result == 5.0   # 15 % is at the upper limit

    def test_missing_actual_falls_back_to_manual_rating(self):
        # When actual is None, fall back to manual_rating
        record  = {"actual": None, "target": 100.0, "manual_rating": 2.5}
        mapping = {
            "scale_type": "interpolated",
            "input_type": "achievement_pct",
            "ll":         90.0,
            "ul":         110.0,
            "inverse":    False,
        }
        assert calculate_rating(record, mapping, bracket_rules=[]) == 2.5

    def test_unknown_scale_type_returns_one(self):
        record  = {"actual": 50.0, "target": 100.0, "manual_rating": None}
        mapping = {"scale_type": "unknown_scale"}
        assert calculate_rating(record, mapping, bracket_rules=[]) == 1.0


# ---------------------------------------------------------------------------
# compute_achievement_pct
# ---------------------------------------------------------------------------

class TestComputeAchievementPct:
    """Tests for the achievement percentage helper used by the chart."""

    def test_non_interpolated_scale_returns_none(self):
        mapping = {"scale_type": "bracket"}
        assert compute_achievement_pct({}, mapping) is None

    def test_achievement_pct_input_type(self):
        record  = {"actual": 110.0, "target": 100.0}
        mapping = {
            "scale_type": "interpolated",
            "input_type": "achievement_pct",
            "inverse":    False,
        }
        assert compute_achievement_pct(record, mapping) == 110.0

    def test_raw_actual_x100_input_type(self):
        record  = {"actual": 0.25, "target": None}
        mapping = {
            "scale_type": "interpolated",
            "input_type": "raw_actual_x100",
            "inverse":    False,
        }
        # 0.25 × 100 = 25.0 %
        assert compute_achievement_pct(record, mapping) == 25.0

    def test_missing_actual_returns_none(self):
        record  = {"actual": None, "target": 100.0}
        mapping = {
            "scale_type": "interpolated",
            "input_type": "achievement_pct",
            "inverse":    False,
        }
        assert compute_achievement_pct(record, mapping) is None

    def test_zero_target_with_inverse_returns_none(self):
        # Division by zero guard: actual=0 with inverse should return None
        record  = {"actual": 0.0, "target": 100.0}
        mapping = {
            "scale_type": "interpolated",
            "input_type": "achievement_pct",
            "inverse":    True,
        }
        assert compute_achievement_pct(record, mapping) is None
