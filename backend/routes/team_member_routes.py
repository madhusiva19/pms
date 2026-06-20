"""Team member controller routes."""

from flask import Blueprint

from services import team_member_service as service


team_member_bp = Blueprint("team_members", __name__, url_prefix="/api/team-members")

# Team member endpoints power the My Team, Members, and evaluation entry screens.
team_member_bp.add_url_rule("", view_func=service.get_team_members, methods=["GET"])
team_member_bp.add_url_rule("/<member_id>", view_func=service.get_team_member, methods=["GET"])
team_member_bp.add_url_rule("/<member_id>/status", view_func=service.update_member_status, methods=["PUT"])
