"""Evaluation status tracking controller routes."""

from flask import Blueprint

from services import evaluation_status_service as service


evaluation_status_bp = Blueprint("evaluation_status", __name__, url_prefix="/api/evaluation-status")

# The frontend passes an employee/member id and receives a workflow timeline.
evaluation_status_bp.add_url_rule("/<int:employee_id>", view_func=service.get_evaluation_status, methods=["GET"])
