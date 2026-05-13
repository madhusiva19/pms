from flask import Blueprint, request, jsonify
from services.notification_service import get_notifications, mark_read, trigger_cutoff

notification_bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")


@notification_bp.get("/<employee_id>")
def get_notifications_route(employee_id):
    try:
        result, status = get_notifications(employee_id)
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@notification_bp.patch("/<notification_id>/read")
def mark_notification_read(notification_id):
    try:
        result, status = mark_read(notification_id)
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@notification_bp.post("/trigger-cutoff")
def trigger_cutoff_route():
    try:
        result, status = trigger_cutoff(request.get_json(silent=True) or {})
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500
