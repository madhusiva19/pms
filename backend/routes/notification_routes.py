"""Notification controller routes."""

from flask import Blueprint

from services import notification_service as service


notification_bp = Blueprint("evaluation_notifications", __name__, url_prefix="/api/evaluation-notifications")

# Notification endpoints let the UI list alerts, create test/manual alerts, and
# persist read state.
notification_bp.add_url_rule("", view_func=service.get_notifications, methods=["GET"], strict_slashes=False)
notification_bp.add_url_rule("", view_func=service.add_notification, methods=["POST"], strict_slashes=False)
notification_bp.add_url_rule("/<notification_id>/read", view_func=service.mark_notification_read, methods=["PUT"])

# Legacy alias — some browser sessions may still have the old "/api/notifications" URL
# compiled in their JS bundle. Both URLs serve the same data.
notifications_alias_bp = Blueprint("notifications_alias", __name__, url_prefix="/api/notifications")
notifications_alias_bp.add_url_rule("", view_func=service.get_notifications, methods=["GET"], strict_slashes=False)
notifications_alias_bp.add_url_rule("", view_func=service.add_notification, methods=["POST"], strict_slashes=False)
notifications_alias_bp.add_url_rule("/<notification_id>/read", view_func=service.mark_notification_read, methods=["PUT"])
