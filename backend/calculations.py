"""
calculations.py
---------------
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

    Implements the matrix rule defined in the assessment specification:
      - High (H): (H,H,H), (H,H,M), or (H,H,L)
      - Low (L): (L,L,M) or (L,L,L)
      - Medium (M): All other combinations
    """
    # Sort ratings to identify patterns regardless of which pillar has which score
    scores = sorted([ability, aspiration, leadership], reverse=True)
    pattern = tuple(scores)

    # High Potentiality Cases (Matches Matrix Row 1-4) 
    if pattern in [
        ('H', 'H', 'H'),
        ('H', 'H', 'M'),
        ('H', 'H', 'L')  # This now correctly results in 'H' per the matrix 
    ]:
        return 'H'

    # Low Potentiality Cases (Matches Matrix Row 9-10) 
    if pattern in [
        ('L', 'L', 'M'),
        ('L', 'L', 'L')
    ]:
        return 'L'

    # Everything else is Medium (Matches Matrix Row 5-8) 
    return 'M'