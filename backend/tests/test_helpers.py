"""
Unit tests for utils/helpers.py — pure helper functions only.
resolve_emp_ids_by_scope is excluded (requires DB).

Run with:  pytest
"""
import pytest
from utils.helpers import calculate_bell_curve_from_scores, get_period_dates


class TestGetPeriodDates:

    def test_mid_year_returns_h1_range(self):
        start, end = get_period_dates('mid_year', 2026)
        assert start == '2026-01-01'
        assert end   == '2026-06-30'

    def test_year_end_returns_h2_range(self):
        start, end = get_period_dates('year_end', 2026)
        assert start == '2026-07-01'
        assert end   == '2026-12-31'

    def test_unknown_period_defaults_to_year_end(self):
        start, end = get_period_dates('unknown', 2026)
        assert start == '2026-07-01'
        assert end   == '2026-12-31'


class TestCalculateBellCurveFromScores:

    def test_empty_records_returns_all_zero_buckets(self):
        result = calculate_bell_curve_from_scores([])
        assert len(result) == 8
        assert all(b['employee_count'] == 0 for b in result)
        assert all(b['percentage'] == 0 for b in result)

    def test_score_lands_in_correct_bucket(self):
        records = [{'total_score': '4.7'}]
        result  = calculate_bell_curve_from_scores(records)
        bucket  = next(b for b in result if b['rating_range'] == '4.5-5.0')
        assert bucket['employee_count'] == 1
        assert bucket['percentage'] == 100.0

    def test_boundary_score_5_0_included_in_top_bucket(self):
        records = [{'total_score': '5.0'}]
        result  = calculate_bell_curve_from_scores(records)
        top     = next(b for b in result if b['rating_range'] == '4.5-5.0')
        assert top['employee_count'] == 1

    def test_lower_boundary_exclusive_for_non_top_buckets(self):
        # score of exactly 2.0 should go to 2.0-2.5, NOT 1.5-2.0
        records = [{'total_score': '2.0'}]
        result  = calculate_bell_curve_from_scores(records)
        lower   = next(b for b in result if b['rating_range'] == '1.5-2.0')
        upper   = next(b for b in result if b['rating_range'] == '2.0-2.5')
        assert lower['employee_count'] == 0
        assert upper['employee_count'] == 1

    def test_percentages_sum_to_100(self):
        records = [{'total_score': str(s)} for s in [1.2, 2.3, 3.4, 4.6]]
        result  = calculate_bell_curve_from_scores(records)
        total   = sum(b['percentage'] for b in result)
        assert round(total, 1) == 100.0

    def test_records_with_none_score_are_ignored(self):
        records = [{'total_score': None}, {'total_score': '3.5'}]
        result  = calculate_bell_curve_from_scores(records)
        total   = sum(b['employee_count'] for b in result)
        assert total == 1

    def test_returns_eight_buckets(self):
        result = calculate_bell_curve_from_scores([{'total_score': '3.0'}])
        assert len(result) == 8

    def test_all_bucket_labels_present(self):
        expected = ['1.0-1.5', '1.5-2.0', '2.0-2.5', '2.5-3.0',
                    '3.0-3.5', '3.5-4.0', '4.0-4.5', '4.5-5.0']
        result = calculate_bell_curve_from_scores([])
        assert [b['rating_range'] for b in result] == expected
