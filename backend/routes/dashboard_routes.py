from flask import Blueprint, request, jsonify
from services.dashboard_service import get_stats, get_charts, get_drilldown
from utils.auth_guard import require_auth, is_authorized_for

dashboard_bp = Blueprint("dashboard", __name__, url_prefix="/api/dashboard")


@dashboard_bp.get("/stats/<employee_id>")
def get_dashboard_stats(employee_id):
    try:
        caller_id = require_auth(request)
        if not caller_id:
            return jsonify({"message": "Unauthorized"}), 401
        if not is_authorized_for(caller_id, employee_id):
            return jsonify({"message": "Forbidden"}), 403

        result, status = get_stats(employee_id)
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@dashboard_bp.get("/charts/<employee_id>")
def get_dashboard_charts(employee_id):
    try:
        caller_id = require_auth(request)
        if not caller_id:
            return jsonify({"message": "Unauthorized"}), 401
        if not is_authorized_for(caller_id, employee_id):
            return jsonify({"message": "Forbidden"}), 403

        result, status = get_charts(employee_id)
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@dashboard_bp.get("/drilldown")
def get_dashboard_drilldown():
    try:
        caller_id = require_auth(request)
        if not caller_id:
            return jsonify({"message": "Unauthorized"}), 401

        entity_type = request.args.get("entity_type", "")
        entity_id   = request.args.get("entity_id", "")

        result, status = get_drilldown(entity_type, entity_id)
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500
