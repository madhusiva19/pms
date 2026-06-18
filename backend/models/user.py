"""
models/user.py
---------------
Type definitions for user and organisational data structures.

These are plain TypedDicts — no ORM, no DB calls.
"""

from typing import Optional
from typing_extensions import TypedDict


class OrgContext(TypedDict):
    """
    Describes which organisational unit an evaluator administers.
    Shown in the Manual Ratings page header.
    """
    label: str   # e.g. "Branch", "Department"
    value: str   # e.g. "Colombo Branch", "Finance"


class EvaluatorProfile(TypedDict):
    """Response shape for GET /api/evaluator/<id>/profile."""
    id:          str
    full_name:   str
    email:       str
    role:        str
    designation: str
    org_context: Optional[OrgContext]


class TeamMember(TypedDict):
    """One member of an evaluator's direct-report team."""
    id:            str
    full_name:     str
    designation:   str
    emp_id:        str
    template_id:   Optional[int]
    template_name: Optional[str]


class RatingStatus(TypedDict):
    """Per-user manual rating submission status."""
    submitted: bool
    pending:   int
    total:     int


class OrgItem(TypedDict):
    """
    De-duplicated organisational unit item (country, branch, department,
    or sub-department) returned by the /api/org/* endpoints.
    """
    id:      str
    name:    str
    all_ids: list  # list[str] — all underlying DB ids that share this name
