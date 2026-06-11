"""Performance data controller routes."""

from flask import Blueprint

from services import performance_service as service


performance_bp = Blueprint("performance", __name__, url_prefix="/api")

# Performance records are detailed objective rows; summary is aggregate dashboard
# style data used by multiple screens.
performance_bp.add_url_rule("/performance-records", view_func=service.get_performance_records, methods=["GET"])
performance_bp.add_url_rule("/performance-summary", view_func=service.get_performance_summary, methods=["GET"])
