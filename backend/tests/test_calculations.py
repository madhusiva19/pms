"""
Unit tests for calculations.py — potential assessment rating logic.

Run with:  pytest
"""
import pytest
from utils.calculations import calculate_pillar_rating, calculate_overall_potentiality


class TestCalculatePillarRating:
    """Tests for the majority-rule pillar rating function."""

    def test_all_high_returns_h(self):
        assert calculate_pillar_rating(['H', 'H', 'H']) == 'H'

    def test_two_high_one_medium_returns_h(self):
        assert calculate_pillar_rating(['H', 'H', 'M']) == 'H'

    def test_two_high_one_low_returns_h(self):
        # Verifies H-first check: two H's outweigh one L (majority rule, not veto)
        assert calculate_pillar_rating(['H', 'H', 'L']) == 'H'

    def test_all_low_returns_l(self):
        assert calculate_pillar_rating(['L', 'L', 'L']) == 'L'

    def test_two_low_one_medium_returns_l(self):
        assert calculate_pillar_rating(['L', 'L', 'M']) == 'L'

    def test_all_medium_returns_m(self):
        # No majority for H or L, so result falls through to M
        assert calculate_pillar_rating(['M', 'M', 'M']) == 'M'

    def test_one_of_each_returns_m(self):
        # H count = 1, L count = 1 — neither reaches majority of 2
        assert calculate_pillar_rating(['H', 'M', 'L']) == 'M'

    def test_one_high_two_medium_returns_m(self):
        assert calculate_pillar_rating(['H', 'M', 'M']) == 'M'


class TestCalculateOverallPotentiality:
    """
    Tests for the matrix-rule overall potentiality function.
    Covers all 10 combinations specified in the assessment matrix PDF.
    """

    # ── High Potentiality cases 

    def test_hhh_returns_h(self):
        assert calculate_overall_potentiality('H', 'H', 'H') == 'H'

    def test_mhh_returns_h(self):
        # h>=2 and l==0: M does not block High (only L does)
        assert calculate_overall_potentiality('M', 'H', 'H') == 'H'

    # ── Medium Potentiality cases 

    def test_mmh_returns_m(self):
        # h count = 1: does not reach the h>=2 threshold for High
        assert calculate_overall_potentiality('M', 'M', 'H') == 'M'

    def test_lhh_returns_m(self):
        # l==0 guard: a single L blocks High even when two pillars are H
        assert calculate_overall_potentiality('L', 'H', 'H') == 'M'

    def test_lmh_returns_m(self):
        assert calculate_overall_potentiality('L', 'M', 'H') == 'M'

    def test_mmm_returns_m(self):
        # No H or L majority: all three pillars resolve to Medium
        assert calculate_overall_potentiality('M', 'M', 'M') == 'M'

    def test_llh_returns_m(self):
        # h==0 guard: a single H blocks Low even when two pillars are L
        assert calculate_overall_potentiality('L', 'L', 'H') == 'M'

    def test_mml_returns_m(self):
        # l count = 1: does not reach the l>=2 threshold for Low
        assert calculate_overall_potentiality('M', 'M', 'L') == 'M'

    # ── Low Potentiality cases
    def test_llm_returns_l(self):
        # l>=2 and h==0: M does not block Low (only H does)
        assert calculate_overall_potentiality('L', 'L', 'M') == 'L'

    def test_lll_returns_l(self):
        assert calculate_overall_potentiality('L', 'L', 'L') == 'L'
