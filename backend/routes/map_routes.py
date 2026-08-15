from flask import Blueprint, request, jsonify
from services.map_service import get_map_tree
from utils.auth_guard import require_auth

map_bp = Blueprint("map", __name__, url_prefix="/api/org")


@map_bp.get("/map-tree")
def get_org_map_tree():
    try:
        caller_id = require_auth(request)
        if not caller_id:
            return jsonify({"message": "Unauthorized"}), 401

        country_id = request.args.get("country_id")

        result, status = get_map_tree(country_id)
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500
