"""
routes/assignment_routes.py

HTTP endpoints for template assignment.
Supports both the legacy /assign-template endpoint and the
RESTful /templates/<id>/assign endpoint — both call the same service.
"""

from flask import Blueprint, jsonify, request

from services.freeze_service import (
    can_role_edit,
    get_request_level,
    is_template_from_past_cycle,
)
from services.assignment_service import assign_template

assignment_bp = Blueprint("assignment", __name__)


def _do_assign_template():
    """Shared handler for both assignment endpoints."""
    try:
        level = get_request_level()
        if not can_role_edit(level):
            return jsonify({"error": "Cannot assign — template is frozen."}), 403

        data        = request.get_json()
        template_id = data.get("template_id")
        if not template_id:
            return jsonify({"error": "template_id is required"}), 400
        if is_template_from_past_cycle(template_id):
            return jsonify({
                "error": "Cannot modify assignments — past-cycle template is permanently frozen."
            }), 403

        rules  = data.get("rules") or []
        result = assign_template(template_id, rules)
        return jsonify({
            "message":       "Template assigned successfully",
            "rules_stored":  result["rules_stored"],
            "users_matched": result["users_matched"],
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400


@assignment_bp.route("/assign-template", methods=["POST"])
def assign_template_route():
    return _do_assign_template()


@assignment_bp.route("/templates/<int:template_id>/assign", methods=["POST"])
def assign_template_by_id(template_id):
    """RESTful variant — template_id comes from the URL, not the body."""
    try:
        level = get_request_level()
        if not can_role_edit(level):
            return jsonify({"error": "Cannot assign — template is frozen."}), 403
        if is_template_from_past_cycle(template_id):
            return jsonify({
                "error": "Cannot modify assignments — past-cycle template is permanently frozen."
            }), 403

        data  = request.get_json() or {}
        rules = data.get("rules") or []
        result = assign_template(template_id, rules)
        return jsonify({
            "message":       "Template assigned successfully",
            "rules_stored":  result["rules_stored"],
            "users_matched": result["users_matched"],
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400
