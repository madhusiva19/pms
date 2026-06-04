"""Notification controller routes."""

from flask import Blueprint

from services import notification_service as service


notification_bp = Blueprint("evaluation_notifications", __name__, url_prefix="/api/evaluation-notifications")

# Notification endpoints let the UI list alerts, create test/manual alerts, and
# persist read state.
notification_bp.add_url_rule("", view_func=service.get_notifications, methods=["GET"])
notification_bp.add_url_rule("", view_func=service.add_notification, methods=["POST"])
notification_bp.add_url_rule("/<notification_id>/read", view_func=service.mark_notification_read, methods=["PUT"])
