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
    # H is checked before L so that ['H','H','L'] correctly returns H
    # (two H's outweigh one L under majority rule)
    if h >= 2:
        return 'H'
    # Only reached when H count < 2, so no conflict with the H branch above
    if l >= 2:
        return 'L'
    # Neither majority: covers ties like ['H','M','L'] or all-M
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

    # l == 0 guard: a single L blocks High even when two pillars are H (per spec matrix row H,H,L → M)
    if h >= 2 and l == 0:
        return 'H'
    # h == 0 guard: a single H blocks Low even when two pillars are L (per spec matrix row H,L,L → M)
    if l >= 2 and h == 0:
        return 'L'
    # All remaining combinations (mixed or all-M) resolve to Medium
    return 'M'
