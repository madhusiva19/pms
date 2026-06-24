from flask import Blueprint, request, jsonify
from services.auth_service import login_user, forgot_password, reset_password

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.post("/login")
def login():
    try:
        result, status = login_user(request.get_json())
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@auth_bp.post("/forgot-password")
def forgot_password_route():
    try:
        result, status = forgot_password(request.get_json())
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@auth_bp.post("/reset-password")
def reset_password_route():
    try:
        result, status = reset_password(request.get_json())
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500
