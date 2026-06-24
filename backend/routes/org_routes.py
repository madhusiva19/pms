"""
routes/org_routes.py

HTTP endpoints for organisational reference data:
countries, branches, sub-departments, designations, departments, users.
"""

from flask import Blueprint, jsonify, request

from services.org_service import (
    get_all_countries,
    get_all_branches,
    create_branch,
    get_sub_departments,
    get_all_designations,
    create_designation,
    get_all_departments,
    create_department,
    get_all_users,
)

org_bp = Blueprint("org", __name__)


# ── Countries ─────────────────────────────────────────────────────────────────

@org_bp.route("/countries", methods=["GET"])
def get_countries():
    try:
        return jsonify(get_all_countries()), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ── Branches ──────────────────────────────────────────────────────────────────

@org_bp.route("/branches", methods=["GET"])
def get_branches():
    try:
        return jsonify(get_all_branches()), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@org_bp.route("/branches", methods=["POST"])
def create_branch_route():
    try:
        branch = create_branch(request.get_json())
        return jsonify(branch), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except LookupError as e:
        return jsonify({"error": str(e)}), 409
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ── Sub-departments ───────────────────────────────────────────────────────────

@org_bp.route("/sub-departments", methods=["GET"])
def get_sub_departments_route():
    try:
        dept_filter = request.args.get("department_id", "").strip() or None
        return jsonify(get_sub_departments(dept_filter)), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ── Designations ──────────────────────────────────────────────────────────────

@org_bp.route("/designations", methods=["GET"])
def get_designations():
    try:
        return jsonify(get_all_designations()), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@org_bp.route("/designations", methods=["POST"])
def create_designation_route():
    try:
        desig = create_designation(request.get_json())
        return jsonify(desig), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except LookupError as e:
        return jsonify({"error": str(e)}), 409
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ── Departments ───────────────────────────────────────────────────────────────

@org_bp.route("/departments", methods=["GET"])
def get_departments():
    try:
        return jsonify(get_all_departments()), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@org_bp.route("/departments", methods=["POST"])
def create_department_route():
    try:
        dept = create_department(request.get_json())
        return jsonify(dept), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except LookupError as e:
        return jsonify({"error": str(e)}), 409
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ── Users ─────────────────────────────────────────────────────────────────────

@org_bp.route("/users", methods=["GET"])
def get_users():
    try:
        return jsonify(get_all_users()), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400
