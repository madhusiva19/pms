"""Approval workflow controller routes."""

from flask import Blueprint

from services import approval_service as service


approval_bp = Blueprint("approvals", __name__, url_prefix="/api/approvals")

# Controller layer only: URL + HTTP method mapping. Approval business rules live
# in services/approval_service.py.
approval_bp.add_url_rule("", view_func=service.get_approvals, methods=["GET"])
approval_bp.add_url_rule("/<approval_id>", view_func=service.get_approval, methods=["GET"])
approval_bp.add_url_rule("/<approval_id>", view_func=service.update_approval, methods=["PUT"])
