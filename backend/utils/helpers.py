"""
utils/helpers.py
----------------
Pure helper functions that contain no business logic.

These are stateless utilities — no database calls, no Flask context.
Import individual functions wherever needed.
"""

from datetime import date


# ---------------------------------------------------------------------------
# Date utilities
# ---------------------------------------------------------------------------

def parse_date(value: str) -> date | None:
    """
    Safely parse an ISO-8601 date string (e.g. '2025-06-30') into a
    `datetime.date` object.

    Returns None if the value is falsy or cannot be parsed, so callers
    can do  `if not parse_date(x):` without a try/except.
    """
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Collection utilities
# ---------------------------------------------------------------------------

def unique_by_name(rows: list[dict]) -> list[dict]:
    """
    De-duplicate a list of ``{id, name, ...}`` dicts by the ``name`` field
    (case-insensitive, stripped of surrounding whitespace).

    Rows that share the same name are merged: the first occurrence keeps
    its ``id`` as the canonical id, and all ids are collected into an
    ``all_ids`` list so callers can still resolve every underlying record.

    Rows with an empty or missing name are silently dropped.

    Returns a list sorted alphabetically by name.
    """
    seen: dict[str, dict] = {}

    for row in rows:
        name = (row.get("name") or "").strip()

        # Skip rows without a usable name
        if not name:
            continue

        key = name.lower()

        if key not in seen:
            seen[key] = {
                "id":      row["id"],
                "name":    name,
                "all_ids": [row["id"]],
            }
        else:
            # Accumulate duplicate ids so callers know every matching record
            seen[key]["all_ids"].append(row["id"])

    return sorted(seen.values(), key=lambda x: x["name"])
