"""
tests/test_helpers.py
----------------------
Unit tests for utils/helpers.py.

Run with:
    pytest tests/test_helpers.py -v

No database connection required — all functions are pure.
"""

import pytest
from datetime import date

from utils.helpers import parse_date, unique_by_name


# ---------------------------------------------------------------------------
# parse_date
# ---------------------------------------------------------------------------

class TestParseDate:
    """Tests for the ISO date string parser."""

    def test_valid_iso_string(self):
        assert parse_date("2025-06-30") == date(2025, 6, 30)

    def test_datetime_string_truncated_to_date(self):
        # Only the first 10 characters are used
        assert parse_date("2025-06-30T12:00:00") == date(2025, 6, 30)

    def test_none_input_returns_none(self):
        assert parse_date(None) is None

    def test_empty_string_returns_none(self):
        assert parse_date("") is None

    def test_invalid_format_returns_none(self):
        # Malformed string should not raise — return None instead
        assert parse_date("not-a-date") is None

    def test_integer_zero_returns_none(self):
        # Falsy non-string should return None gracefully
        assert parse_date(0) is None


# ---------------------------------------------------------------------------
# unique_by_name
# ---------------------------------------------------------------------------

class TestUniqueByName:
    """Tests for the name-based de-duplication helper."""

    def test_no_duplicates_returns_same_items(self):
        rows = [
            {"id": "1", "name": "Alpha"},
            {"id": "2", "name": "Beta"},
        ]
        result = unique_by_name(rows)
        assert len(result) == 2

    def test_duplicates_are_merged(self):
        rows = [
            {"id": "1", "name": "Colombo"},
            {"id": "2", "name": "Colombo"},   # same name, different id
        ]
        result = unique_by_name(rows)
        # Should collapse into one entry
        assert len(result) == 1
        assert set(result[0]["all_ids"]) == {"1", "2"}

    def test_case_insensitive_dedup(self):
        rows = [
            {"id": "1", "name": "Finance"},
            {"id": "2", "name": "FINANCE"},
        ]
        result = unique_by_name(rows)
        assert len(result) == 1

    def test_whitespace_stripped(self):
        rows = [
            {"id": "1", "name": "  HR  "},
            {"id": "2", "name": "HR"},
        ]
        result = unique_by_name(rows)
        assert len(result) == 1

    def test_empty_name_rows_are_dropped(self):
        rows = [
            {"id": "1", "name": ""},
            {"id": "2", "name": None},
            {"id": "3", "name": "Sales"},
        ]
        result = unique_by_name(rows)
        assert len(result) == 1
        assert result[0]["name"] == "Sales"

    def test_result_is_sorted_alphabetically(self):
        rows = [
            {"id": "3", "name": "Zebra"},
            {"id": "1", "name": "Apple"},
            {"id": "2", "name": "Mango"},
        ]
        result = unique_by_name(rows)
        names = [r["name"] for r in result]
        assert names == sorted(names)

    def test_empty_input_returns_empty_list(self):
        assert unique_by_name([]) == []

    def test_all_ids_list_has_correct_length(self):
        rows = [
            {"id": "a", "name": "London"},
            {"id": "b", "name": "London"},
            {"id": "c", "name": "London"},
        ]
        result = unique_by_name(rows)
        assert len(result[0]["all_ids"]) == 3
