from flask import Blueprint, jsonify
from services.dashboard_service import get_stats, get_charts

dashboard_bp = Blueprint("dashboard", __name__, url_prefix="/api/dashboard")


@dashboard_bp.get("/stats/<employee_id>")
def get_dashboard_stats(employee_id):
    try:
        result, status = get_stats(employee_id)
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@dashboard_bp.get("/charts/<employee_id>")
def get_dashboard_charts(employee_id):
    try:
        result, status = get_charts(employee_id)
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500
