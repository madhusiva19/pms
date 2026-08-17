from flask import Blueprint, request, jsonify
from models import supabase
from services.training_service import (
    get_training_attended, add_training_attended,
    add_training_suggestion, get_training_suggestions,
    get_subordinate_suggestions, review_suggestion,
    mark_suggestions_viewed, delete_training_attended,
)
from utils.auth_guard import require_auth, is_authorized_for

training_bp = Blueprint("training", __name__, url_prefix="/api/training")


@training_bp.get("/attended/<employee_id>")
def get_training_attended_route(employee_id):
    try:
        caller_id = require_auth(request)
        if not caller_id:
            return jsonify({"message": "Unauthorized"}), 401
        if not is_authorized_for(caller_id, employee_id):
            return jsonify({"message": "Forbidden"}), 403

        result, status = get_training_attended(employee_id)
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@training_bp.post("/attended")
def add_training_attended_route():
    try:
        caller_id = require_auth(request)
        if not caller_id:
            return jsonify({"message": "Unauthorized"}), 401

        if not is_authorized_for(caller_id, request.form.get("employee_id")):
            return jsonify({"message": "Forbidden"}), 403

        result, status = add_training_attended(request)
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@training_bp.post("/suggestions")
def add_training_suggestion_route():
    try:
        caller_id = require_auth(request)
        if not caller_id:
            return jsonify({"message": "Unauthorized"}), 401

        body = request.get_json(silent=True) or {}
        if not is_authorized_for(caller_id, body.get("employee_id")):
            return jsonify({"message": "Forbidden"}), 403

        result, status = add_training_suggestion(body)
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@training_bp.get("/suggestions/<employee_id>")
def get_training_suggestions_route(employee_id):
    try:
        caller_id = require_auth(request)
        if not caller_id:
            return jsonify({"message": "Unauthorized"}), 401
        if not is_authorized_for(caller_id, employee_id):
            return jsonify({"message": "Forbidden"}), 403

        result, status = get_training_suggestions(employee_id)
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@training_bp.patch("/suggestions/mark-viewed/<employee_id>")
def mark_suggestions_viewed_route(employee_id):
    try:
        caller_id = require_auth(request)
        if not caller_id:
            return jsonify({"message": "Unauthorized"}), 401
        if not is_authorized_for(caller_id, employee_id):
            return jsonify({"message": "Forbidden"}), 403

        result, status = mark_suggestions_viewed(employee_id)
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@training_bp.get("/subordinate-suggestions/<supervisor_id>")
def get_subordinate_suggestions_route(supervisor_id):
    try:
        caller_id = require_auth(request)
        if not caller_id:
            return jsonify({"message": "Unauthorized"}), 401
        if not is_authorized_for(caller_id, supervisor_id):
            return jsonify({"message": "Forbidden"}), 403

        result, status = get_subordinate_suggestions(supervisor_id)
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@training_bp.patch("/suggestions/<suggestion_id>")
def review_suggestion_route(suggestion_id):
    try:
        caller_id = require_auth(request)
        if not caller_id:
            return jsonify({"message": "Unauthorized"}), 401

        suggestion_res = supabase.table("training_suggestions")\
            .select("supervisor_id")\
            .eq("id", suggestion_id)\
            .execute()
        if not suggestion_res.data:
            return jsonify({"message": "Suggestion not found"}), 404
        if caller_id != suggestion_res.data[0].get("supervisor_id"):
            return jsonify({"message": "Forbidden"}), 403

        result, status = review_suggestion(suggestion_id, request.get_json(silent=True) or {})
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@training_bp.delete("/attended/<record_id>")
def delete_training_attended_route(record_id):
    try:
        caller_id = require_auth(request)
        if not caller_id:
            return jsonify({"message": "Unauthorized"}), 401

        record_res = supabase.table("training_passport")\
            .select("user_id")\
            .eq("id", record_id)\
            .execute()
        if not record_res.data:
            return jsonify({"message": "Training record not found"}), 404
        if not is_authorized_for(caller_id, record_res.data[0].get("user_id")):
            return jsonify({"message": "Forbidden"}), 403

        result, status = delete_training_attended(record_id)
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500
