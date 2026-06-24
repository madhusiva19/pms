from flask import Blueprint, request, jsonify
from services.profile_service import get_profile, upload_avatar, remove_avatar

profile_bp = Blueprint("profile", __name__, url_prefix="/api/profile")


@profile_bp.get("/<employee_id>")
def get_profile_route(employee_id):
    try:
        result, status = get_profile(employee_id)
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@profile_bp.post("/upload-avatar")
def upload_avatar_route():
    try:
        result, status = upload_avatar(request)
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@profile_bp.delete("/remove-avatar/<employee_id>")
def remove_avatar_route(employee_id):
    try:
        result, status = remove_avatar(employee_id)
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500
