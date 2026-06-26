"""Employee enquiry controller routes."""

from flask import Blueprint

from services import enquiry_service as service


enquiry_bp = Blueprint("enquiries", __name__, url_prefix="/api/enquiries")

# Employee enquiry requests are posted here and handled by enquiry_service.
enquiry_bp.add_url_rule("", view_func=service.get_enquiries,  methods=["GET"])
enquiry_bp.add_url_rule("", view_func=service.create_enquiry, methods=["POST"])
