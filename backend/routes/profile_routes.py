from flask import Blueprint, request, jsonify
from services.profile_service import get_profile, upload_avatar, remove_avatar
from utils.auth_guard import require_auth, is_authorized_for

profile_bp = Blueprint("profile", __name__, url_prefix="/api/profile")


@profile_bp.get("/<employee_id>")
def get_profile_route(employee_id):
    try:
        caller_id = require_auth(request)
        if not caller_id:
            return jsonify({"message": "Unauthorized"}), 401
        if not is_authorized_for(caller_id, employee_id):
            return jsonify({"message": "Forbidden"}), 403

        result, status = get_profile(employee_id)
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@profile_bp.post("/upload-avatar")
def upload_avatar_route():
    try:
        caller_id = require_auth(request)
        if not caller_id:
            return jsonify({"message": "Unauthorized"}), 401

        result, status = upload_avatar(request)
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@profile_bp.delete("/remove-avatar/<employee_id>")
def remove_avatar_route(employee_id):
    try:
        caller_id = require_auth(request)
        if not caller_id:
            return jsonify({"message": "Unauthorized"}), 401

        result, status = remove_avatar(employee_id)
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500
