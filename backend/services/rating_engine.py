"""
services/rating_engine.py
--------------------------
KPI rating calculation engine.

Responsibilities
----------------
- Interpolated scale  → linear interpolation between lower (ll) and upper (ul) limits
- Bracket scale       → table-driven rating lookup with optional inverse ordering
- Manual scale        → pass-through of the human-entered rating
- Achievement %       → derived metric shown on the performance chart

This module is purely computational — it does NOT touch the database or
Flask request context.  All data is passed in as plain Python dicts.
"""

from utils.db import supabase


# ---------------------------------------------------------------------------
# Scale calculation helpers
# ---------------------------------------------------------------------------

def compute_interpolated_rating(value: float, ll: float, ul: float) -> float:
    """
    Map a raw performance value onto the 1–5 rating scale using linear
    interpolation between the lower limit (ll) and upper limit (ul).

    - value ≤ ll  →  rating 1.0  (minimum)
    - value ≥ ul  →  rating 5.0  (maximum)
    - ll < value < ul  →  proportional rating between 1 and 5
    """
    if value <= ll:
        return 1.0
    if value >= ul:
        return 5.0
    return round(1 + (value - ll) / (ul - ll) * 4, 4)


def compute_bracket_rating(actual: float, rules: list[dict], inverse: bool) -> float:
    """
    Look up a rating from a bracket-rule table.

    Rules are sorted ascending by their ``max_val`` ceiling so that the
    first matching bracket is always the correct one.  A ``None`` max_val
    indicates an open-ended top bracket (i.e. "above all others").

    ``inverse`` is accepted for signature compatibility but bracket tables
    already encode direction in their max_val ordering.
    """
    # Sort rules so open-ended (None) brackets come last
    sorted_rules = sorted(
        rules,
        key=lambda r: (r["max_val"] is None, r["max_val"] or 0),
    )

    for rule in sorted_rules:
        if rule["max_val"] is None or actual <= rule["max_val"]:
            return rule["rating"]

    # Fallback: return the last (highest) bracket rating
    return sorted_rules[-1]["rating"]


def calculate_rating(record: dict, mapping: dict, bracket_rules: list[dict]) -> float:
    """
    Dispatch to the correct rating algorithm based on the KPI scale type
    stored in ``mapping``.

    Parameters
    ----------
    record        : A performance_record row (target, actual, manual_rating).
    mapping       : The kpi_scale_mappings row for this objective.
    bracket_rules : All bracket_rules rows for this mapping (may be empty).

    Returns
    -------
    float : Rating in the range 1.0 – 5.0.
    """
    scale_type = mapping.get("scale_type")

    # --- Manual scale: use the human-entered rating directly
    if scale_type == "manual":
        return float(record.get("manual_rating") or 1.0)

    actual = record.get("actual")
    target = record.get("target")

    # Fall back to manual_rating when no actual value has been recorded yet
    if actual is None:
        return float(record.get("manual_rating") or 1.0)

    actual = float(actual)

    # --- Interpolated scale
    if scale_type == "interpolated":
        ll         = float(mapping["ll"])
        ul         = float(mapping["ul"])
        input_type = mapping.get("input_type", "raw_actual")
        inverse    = mapping.get("inverse", False)

        if input_type == "achievement_pct":
            # Protect against division by zero
            if not target:
                return 1.0
            value = (
                (float(target) / actual) * 100
                if inverse
                else (actual / float(target)) * 100
            )

        elif input_type == "raw_actual_x100":
            # Value is stored as a decimal fraction (e.g. 0.15 → 15 %)
            value = actual * 100

        else:
            # raw_actual: use the number as-is
            value = actual

        return compute_interpolated_rating(value, ll, ul)

    # --- Bracket scale
    if scale_type == "bracket":
        return compute_bracket_rating(
            actual, bracket_rules, mapping.get("inverse", False)
        )

    # Unknown scale type — default to the minimum rating
    return 1.0


def compute_achievement_pct(record: dict, mapping: dict) -> float | None:
    """
    Calculate the achievement percentage shown on the performance chart.

    Only meaningful for interpolated KPIs; returns None for bracket and
    manual scales (they have no meaningful single percentage).
    """
    if mapping.get("scale_type") != "interpolated":
        return None

    actual     = record.get("actual")
    target     = record.get("target")
    input_type = mapping.get("input_type", "raw_actual")
    inverse    = mapping.get("inverse", False)

    if actual is None:
        return None

    actual = float(actual)

    if input_type == "achievement_pct":
        if not target:
            return None
        target = float(target)
        if inverse:
            return round((target / actual) * 100, 2) if actual != 0 else None
        return round((actual / target) * 100, 2)

    if input_type == "raw_actual_x100":
        return round(actual * 100, 2)

    if input_type == "raw_actual":
        return round(actual, 2)

    return None


# ---------------------------------------------------------------------------
# Scale metadata loader
# ---------------------------------------------------------------------------

def load_scale_meta() -> tuple[dict, dict, dict, dict]:
    """
    Fetch all scale-related lookup tables from Supabase and return four
    pre-indexed dictionaries for efficient per-record lookups.

    Returns
    -------
    mappings_by_obj  : { objective_id: mapping_row }
    rules_by_mapping : { mapping_id: [bracket_rule_rows] }
    obj_by_id        : { objective_id: objective_row }
    cat_by_id        : { category_id: category_row }
    """
    mappings_raw   = supabase.table("kpi_scale_mappings").select("*").execute().data
    bracket_raw    = supabase.table("bracket_rules").select("*").execute().data
    objectives_raw = supabase.table("objectives").select("*").execute().data
    categories_raw = supabase.table("categories").select("*").execute().data

    # Index mappings by the objective they belong to
    mappings_by_obj: dict = {m["objective_id"]: m for m in mappings_raw}

    # Group bracket rules by their parent mapping id
    rules_by_mapping: dict = {}
    for rule in bracket_raw:
        rules_by_mapping.setdefault(rule["mapping_id"], []).append(rule)

    obj_by_id: dict = {o["id"]: o for o in objectives_raw}
    cat_by_id: dict = {c["id"]: c for c in categories_raw}

    return mappings_by_obj, rules_by_mapping, obj_by_id, cat_by_id
