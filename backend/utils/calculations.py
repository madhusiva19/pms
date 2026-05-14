"""
Pure calculation functions for the Potential Assessment module.
"""

VALID_RATINGS = frozenset({'H', 'M', 'L'})


def calculate_pillar_rating(ratings: list) -> str:
    """
    Derive the overall rating for a single pillar from its three question ratings.

    Uses a majority rule across the three H/M/L question ratings:
      - 2 or more H  →  'H'
      - 2 or more L  →  'L'
      - otherwise    →  'M'
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

    Matrix rules:
      - High (H): 2+ H's with no L  (H,H,H or M,H,H)
      - Low  (L): 2+ L's with no H  (L,L,L or L,L,M)
      - Medium (M): all other combinations
    """
    ratings = [ability, aspiration, leadership]
    h = ratings.count('H')
    l = ratings.count('L')

    if h >= 2 and l == 0:
        return 'H'
    if l >= 2 and h == 0:
        return 'L'
    return 'M'
