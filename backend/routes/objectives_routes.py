"""Objectives controller — exposes /api/objectives."""

from flask import Blueprint

from services import objectives_service as service

objectives_bp = Blueprint("objectives", __name__, url_prefix="/api")

objectives_bp.add_url_rule(
    "/objectives",
    view_func=service.get_objectives,
    methods=["GET"],
)
