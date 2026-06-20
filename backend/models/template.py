"""
models/template.py
-------------------
Type definitions for template-related data structures.

These are plain TypedDicts — no ORM, no DB calls.
"""

from typing import Optional
from typing_extensions import TypedDict


class Objective(TypedDict):
    """One row from the ``objectives`` table."""
    id:           int
    name:         str
    weight:       float
    max_score:    float
    control_type: str            # "Locked" | "Editable"
    category_id:  int
    kpi_scale:    Optional[str]  # e.g. "financial_achievement", "manual"


class Category(TypedDict):
    """One row from the ``categories`` table, with nested objectives."""
    id:         int
    name:       str
    weight:     float            # GAP weight shown in the category header row
    type:       str
    objectives: list             # list[Objective]


class Template(TypedDict):
    """One row from the ``templates`` table, with nested categories."""
    id:          int
    name:        str
    description: str
    status:      str             # "active" | "frozen"
    created_by:  str
    categories:  list            # list[Category]


class EmployeeAssignment(TypedDict):
    """Minimal employee record returned from template assignment queries."""
    id:                    str
    name:                  str
    designation:           str
    current_template_id:   Optional[int]
    current_template_name: Optional[str]
