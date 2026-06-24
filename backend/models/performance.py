"""
models/performance.py
----------------------
Type definitions for performance-related data structures.

These are plain TypedDicts — no ORM, no DB calls.
Import them for type hints and IDE auto-complete across the codebase.
"""

from typing import Optional
from typing_extensions import TypedDict


class ObjectiveRecord(TypedDict):
    """
    Represents one row from the ``performance_records`` table,
    enriched with objective metadata for display.
    """
    objective_id:    int
    objective_name:  str
    category_id:     int
    category_name:   str
    weight:          float       # Percentage weight of this objective (e.g. 15.0)
    control_type:    str         # "Locked" or "Editable"
    target:          Optional[float]
    actual:          Optional[float]
    manual_rating:   Optional[float]
    rating_comment:  Optional[str]
    achievement_pct: Optional[float]
    rating:          float       # Calculated 1–5 rating
    score:           float       # rating × (weight / 100)
    scale_type:      str         # "interpolated" | "bracket" | "manual"
    input_type:      Optional[str]
    ll:              Optional[float]
    ul:              Optional[float]
    log_column:      str
    notes:           str
    status:          str         # "approved" | "pending"


class CategoryResult(TypedDict):
    """Aggregated result for one category within a performance breakdown."""
    category_name:   str
    category_weight: float
    objectives:      list        # list[ObjectiveRecord]
    category_score:  float
    max_possible:    float


class EmployeeProfile(TypedDict):
    """Minimal employee profile embedded in performance responses."""
    id:          str
    name:        str
    designation: str
    department:  str


class PerformanceBreakdown(TypedDict):
    """Full response shape returned by GET /api/performance/<user>/<year>/<period>."""
    employee:    EmployeeProfile
    period:      str
    year:        int
    final_score: float
    max_score:   float
    categories:  list            # list[CategoryResult]
