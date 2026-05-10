"""
calculations.py
---------------
Pure calculation functions for the Potential Assessment module.

Kept separate from app.py so they can be imported and unit-tested
without requiring Flask or Supabase to be initialised.
"""

VALID_RATINGS = frozenset({'H', 'M', 'L'})


def calculate_pillar_rating(ratings: list) -> str:
    """
    Derive the overall rating for a single pillar from its three question ratings.

    Uses a majority rule across the three H/M/L question ratings:
      - 2 or more H  →  'H'
      - 2 or more L  →  'L'
      - otherwise    →  'M'

    Args:
        ratings: List of exactly 3 rating strings, each one of 'H', 'M', 'L'.

    Returns:
        str: One of 'H', 'M', 'L'.

    Example:
        >>> calculate_pillar_rating(['H', 'H', 'L'])
        'H'
        >>> calculate_pillar_rating(['L', 'L', 'M'])
        'L'
    """
    h = ratings.count('H')
    l = ratings.count('L')
    if h >= 2:
        return 'H'
    if l >= 2:
        return 'L'
    return 'M'


def calculate_overall_potentiality(ability: str, aspiration: str, leadership: str) -> str:
    """
    Derive Overall Potentiality from the three pillar overall ratings.

    Implements the matrix rule defined in the assessment specification:
      - 2 or more H  AND  0 L  →  'H'  (High Potential)
      - 2 or more L  AND  0 H  →  'L'  (Low Potential)
      - anything else           →  'M'  (Medium Potential)

    A single L prevents a High result even when two pillars are H.
    A single H prevents a Low result even when two pillars are L.

    Args:
        ability:    Overall Ability rating    — one of 'H', 'M', 'L'.
        aspiration: Overall Aspiration rating — one of 'H', 'M', 'L'.
        leadership: Overall Leadership rating — one of 'H', 'M', 'L'.

    Returns:
        str: One of 'H', 'M', 'L'.

    Example:
        >>> calculate_overall_potentiality('H', 'H', 'M')
        'H'
        >>> calculate_overall_potentiality('L', 'H', 'H')
        'M'
        >>> calculate_overall_potentiality('L', 'L', 'M')
        'L'
    """
    ratings = [ability, aspiration, leadership]
    h = ratings.count('H')
    l = ratings.count('L')
    if h >= 2 and l == 0:
        return 'H'
    if l >= 2 and h == 0:
        return 'L'
    return 'M'
