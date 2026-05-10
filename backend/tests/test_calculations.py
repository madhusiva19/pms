"""
Unit tests for calculations.py — potential assessment rating logic.

Run with:  pytest
"""
import pytest
from calculations import calculate_pillar_rating, calculate_overall_potentiality


class TestCalculatePillarRating:
    """Tests for the majority-rule pillar rating function."""

    def test_all_high_returns_h(self):
        assert calculate_pillar_rating(['H', 'H', 'H']) == 'H'

    def test_two_high_one_medium_returns_h(self):
        assert calculate_pillar_rating(['H', 'H', 'M']) == 'H'

    def test_two_high_one_low_returns_h(self):
        """Two H's outvote a single L under majority rule."""
        assert calculate_pillar_rating(['H', 'H', 'L']) == 'H'

    def test_all_low_returns_l(self):
        assert calculate_pillar_rating(['L', 'L', 'L']) == 'L'

    def test_two_low_one_medium_returns_l(self):
        assert calculate_pillar_rating(['L', 'L', 'M']) == 'L'

    def test_all_medium_returns_m(self):
        assert calculate_pillar_rating(['M', 'M', 'M']) == 'M'

    def test_one_of_each_returns_m(self):
        assert calculate_pillar_rating(['H', 'M', 'L']) == 'M'

    def test_one_high_two_medium_returns_m(self):
        assert calculate_pillar_rating(['H', 'M', 'M']) == 'M'


class TestCalculateOverallPotentiality:
    """
    Tests for the matrix-rule overall potentiality function.
    Covers all 10 combinations specified in the assessment matrix PDF.
    """

    # ── High Potentiality cases ──────────────────────────────────────────────

    def test_hhh_returns_h(self):
        assert calculate_overall_potentiality('H', 'H', 'H') == 'H'

    def test_mhh_returns_h(self):
        assert calculate_overall_potentiality('M', 'H', 'H') == 'H'

    # ── Medium Potentiality cases ────────────────────────────────────────────

    def test_mmh_returns_m(self):
        assert calculate_overall_potentiality('M', 'M', 'H') == 'M'

    def test_lhh_returns_m(self):
        """Two H's do NOT produce H when a single L is present."""
        assert calculate_overall_potentiality('L', 'H', 'H') == 'M'

    def test_lmh_returns_m(self):
        assert calculate_overall_potentiality('L', 'M', 'H') == 'M'

    def test_mmm_returns_m(self):
        assert calculate_overall_potentiality('M', 'M', 'M') == 'M'

    def test_llh_returns_m(self):
        """Two L's do NOT produce L when a single H is present."""
        assert calculate_overall_potentiality('L', 'L', 'H') == 'M'

    def test_mml_returns_m(self):
        assert calculate_overall_potentiality('M', 'M', 'L') == 'M'

    # ── Low Potentiality cases ───────────────────────────────────────────────

    def test_llm_returns_l(self):
        assert calculate_overall_potentiality('L', 'L', 'M') == 'L'

    def test_lll_returns_l(self):
        assert calculate_overall_potentiality('L', 'L', 'L') == 'L'
