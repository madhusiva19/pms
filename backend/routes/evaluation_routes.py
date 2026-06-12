"""Evaluation submission and rejection controller routes."""

from flask import Blueprint

from services import evaluation_service as service


evaluation_bp = Blueprint("evaluations", __name__, url_prefix="/api/evaluations")

# Evaluation submission, lookup, and rejection endpoints share the same URL
# family because they operate on evaluation workflow records.
evaluation_bp.add_url_rule("", view_func=service.get_evaluations, methods=["GET"])
evaluation_bp.add_url_rule("", view_func=service.create_evaluation, methods=["POST"])
evaluation_bp.add_url_rule("/<int:evaluation_id>", view_func=service.get_evaluation, methods=["GET"])
evaluation_bp.add_url_rule("/<int:eval_id>/reject", view_func=service.reject_evaluation, methods=["POST"])
