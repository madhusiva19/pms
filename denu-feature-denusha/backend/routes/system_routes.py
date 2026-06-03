"""System and health controller routes."""

from flask import Blueprint

from services import system_service as service


system_bp = Blueprint("system", __name__)

# Lightweight operational endpoints for browser checks and connection health.
system_bp.add_url_rule("/", view_func=service.index, methods=["GET"])
system_bp.add_url_rule("/api/health", view_func=service.health, methods=["GET"])
