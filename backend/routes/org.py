"""
routes/org.py
--------------
Flask Blueprint for organisational hierarchy and PMS cycle endpoints.

Endpoints
---------
GET /api/org/countries            All countries (HQ admins only by convention)
GET /api/org/branches             Branches visible to an evaluator
GET /api/org/departments          Departments visible to an evaluator
GET /api/org/sub-departments      Sub-departments visible to an evaluator
GET /api/pms-cycle/current        Active PMS cycle with objective-setting window status
GET /api/routes                   Debug: list all registered Flask routes
"""

from flask import Blueprint, current_app, jsonify, request

from utils.db import supabase
from utils.helpers import unique_by_name

org_bp = Blueprint("org", __name__)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_evaluator_role(evaluator_id: str) -> tuple[str | None, str | None]:
    """
    Resolve the role and country_id for an evaluator.

    Returns (role, country_id) or (None, None) when the user is not found.
    Used to scope org-hierarchy queries by the evaluator's access level.
    """
    res = (
        supabase.table("users")
        .select("role, country_id")
        .eq("id", evaluator_id)
        .limit(1)
        .execute()
    )

    if res.data:
        return res.data[0].get("role"), res.data[0].get("country_id")

    return None, None


# ---------------------------------------------------------------------------
# Org hierarchy endpoints
# ---------------------------------------------------------------------------

@org_bp.route("/api/org/countries", methods=["GET"])
def get_org_countries():
    """
    Return all countries, de-duplicated by name.

    Typically restricted to HQ admins in the frontend but no server-side
    auth check here — that is handled by the auth middleware layer.
    """
    try:
        res = supabase.table("countries").select("id, name").order("name").execute()
        return jsonify(unique_by_name(res.data or []))

    except Exception as exc:
        print(f"[ERROR] get_org_countries: {exc}")
        return jsonify({"error": str(exc)}), 500


@org_bp.route("/api/org/branches", methods=["GET"])
def get_org_branches():
    """
    Return branches visible to the requesting evaluator.

    Country admins see only branches in their country; all other roles see
    all branches.
    """
    try:
        evaluator_id = request.args.get("evaluator_id", "")
        role, country_id = _get_evaluator_role(evaluator_id)

        query = supabase.table("branches").select("id, name, country_id").order("name")

        if role == "country_admin" and country_id:
            query = query.eq("country_id", country_id)

        res = query.execute()
        return jsonify(unique_by_name(res.data or []))

    except Exception as exc:
        print(f"[ERROR] get_org_branches: {exc}")
        return jsonify({"error": str(exc)}), 500


@org_bp.route("/api/org/departments", methods=["GET"])
def get_org_departments():
    """
    Return departments visible to the requesting evaluator.

    Country admins are scoped to departments inside their country's branches.
    """
    try:
        evaluator_id = request.args.get("evaluator_id", "")
        role, country_id = _get_evaluator_role(evaluator_id)

        query = (
            supabase.table("departments")
            .select("id, name, branch_id")
            .order("name")
        )

        if role == "country_admin" and country_id:
            # Resolve branches in the evaluator's country first
            branch_res = (
                supabase.table("branches")
                .select("id")
                .eq("country_id", country_id)
                .execute()
            )
            branch_ids = [b["id"] for b in (branch_res.data or [])]

            if not branch_ids:
                return jsonify([])

            query = query.in_("branch_id", branch_ids)

        res = query.execute()
        return jsonify(unique_by_name(res.data or []))

    except Exception as exc:
        print(f"[ERROR] get_org_departments: {exc}")
        return jsonify({"error": str(exc)}), 500


@org_bp.route("/api/org/sub-departments", methods=["GET"])
def get_org_sub_departments():
    """
    Return sub-departments visible to the requesting evaluator.

    Country admins are scoped through country → branch → department.
    """
    try:
        evaluator_id = request.args.get("evaluator_id", "")
        role, country_id = _get_evaluator_role(evaluator_id)

        query = (
            supabase.table("sub_departments")
            .select("id, name, department_id")
            .order("name")
        )

        if role == "country_admin" and country_id:
            # Walk down the hierarchy: country → branches → departments → sub-depts
            branch_res = (
                supabase.table("branches")
                .select("id")
                .eq("country_id", country_id)
                .execute()
            )
            branch_ids = [b["id"] for b in (branch_res.data or [])]

            if not branch_ids:
                return jsonify([])

            dept_res = (
                supabase.table("departments")
                .select("id")
                .in_("branch_id", branch_ids)
                .execute()
            )
            dept_ids = [d["id"] for d in (dept_res.data or [])]

            if not dept_ids:
                return jsonify([])

            query = query.in_("department_id", dept_ids)

        res = query.execute()
        return jsonify(unique_by_name(res.data or []))

    except Exception as exc:
        print(f"[ERROR] get_org_sub_departments: {exc}")
        return jsonify({"error": str(exc)}), 500


# ---------------------------------------------------------------------------
# PMS cycle
# ---------------------------------------------------------------------------

@org_bp.route("/api/pms-cycle/current", methods=["GET"])
def get_current_pms_cycle():
    """
    Return the active PMS cycle with its objective-setting window status.

    Response shape
    --------------
    {
      cycle:           { ...pms_cycles row },
      editing_open:    bool,
      reason:          str | None,
      objective_setting_start: str | None,
      objective_setting_end:   str | None,
      grace_period_end:        str | None,
      today:           str (ISO date),
    }
    """
    try:
        from datetime import date

        result = (
            supabase.table("pms_cycles")
            .select("*")
            .eq("is_active", True)
            .order("pms_year", desc=True)
            .limit(1)
            .execute()
        )

        if not result.data:
            return jsonify({
                "cycle":        None,
                "editing_open": False,
                "reason":       "No active PMS cycle found",
            })

        cycle = result.data[0]
        today = date.today()

        obj_start = cycle.get("objective_setting_start")
        obj_end   = cycle.get("objective_setting_end")

        # Use grace period end when available; fall back to the regular end date
        grace_end = cycle.get("grace_period_end") or obj_end

        def _parse(d: str | None):
            if not d:
                return None
            return date.fromisoformat(str(d)[:10])

        start = _parse(obj_start)
        end   = _parse(grace_end)

        if not start or not end:
            return jsonify({
                "cycle":        cycle,
                "editing_open": False,
                "reason":       "Objective setting dates not configured by Group Admin",
            })

        editing_open = start <= today <= end

        # Provide a human-readable reason when editing is blocked
        reason = None
        if not editing_open:
            if today < start:
                reason = (
                    f"Objective setting window opens on {start.strftime('%d %b %Y')}"
                )
            else:
                reason = (
                    f"Objective setting window closed on {end.strftime('%d %b %Y')}"
                )

        return jsonify({
            "cycle":                   cycle,
            "editing_open":            editing_open,
            "reason":                  reason,
            "objective_setting_start": obj_start,
            "objective_setting_end":   obj_end,
            "grace_period_end":        cycle.get("grace_period_end"),
            "today":                   today.isoformat(),
        })

    except Exception as exc:
        print(f"[ERROR] get_current_pms_cycle: {exc}")
        return jsonify({"error": str(exc)}), 500


# ---------------------------------------------------------------------------
# Debug: route listing
# ---------------------------------------------------------------------------

@org_bp.route("/api/routes", methods=["GET"])
def list_routes():
    """Return all registered URL rules (useful during development)."""
    return jsonify([str(rule) for rule in current_app.url_map.iter_rules()])
