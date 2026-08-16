from flask import Blueprint, request, jsonify
from models import supabase
from services.diary_service import (
    get_diary, save_diary, submit_diary, add_supervisor_diary,
    approve_diary, reject_diary, delete_diary,
)
from utils.auth_guard import require_auth, is_authorized_for

diary_bp = Blueprint("diary", __name__, url_prefix="/api/diary")


def _diary_owner(diary_id):
    """Looks up the user_id (owner) of a diary entry, or None if it doesn't exist."""
    res = supabase.table("performance_diary")\
        .select("user_id")\
        .eq("id", diary_id)\
        .execute()
    if not res.data:
        return None
    return res.data[0].get("user_id")


@diary_bp.get("/<employee_id>")
def get_diary_route(employee_id):
    try:
        caller_id = require_auth(request)
        if not caller_id:
            return jsonify({"message": "Unauthorized"}), 401
        if not is_authorized_for(caller_id, employee_id):
            return jsonify({"message": "Forbidden"}), 403

        result, status = get_diary(employee_id)
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@diary_bp.post("/save")
def save_diary_route():
    try:
        caller_id = require_auth(request)
        if not caller_id:
            return jsonify({"message": "Unauthorized"}), 401

        body = request.get_json(silent=True) or {}
        if not is_authorized_for(caller_id, body.get("employee_id")):
            return jsonify({"message": "Forbidden"}), 403

        result, status = save_diary(body)
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@diary_bp.post("/submit")
def submit_diary_route():
    try:
        caller_id = require_auth(request)
        if not caller_id:
            return jsonify({"message": "Unauthorized"}), 401

        body = request.get_json(silent=True) or {}
        if not is_authorized_for(caller_id, body.get("employee_id")):
            return jsonify({"message": "Forbidden"}), 403

        result, status = submit_diary(body)
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@diary_bp.post("/supervisor")
def add_supervisor_diary_route():
    try:
        caller_id = require_auth(request)
        if not caller_id:
            return jsonify({"message": "Unauthorized"}), 401

        body = request.get_json(silent=True) or {}
        employee_id = body.get("employee_id")
        # Caller must both be the declared author and be above the employee
        # in the reporting chain, so a client can't attribute the comment to
        # a different supervisor or write into someone else's diary. A
        # supervisor comment about yourself is never valid, regardless of
        # what is_authorized_for's self-access shortcut would otherwise allow.
        if caller_id != body.get("supervisor_id") or caller_id == employee_id:
            return jsonify({"message": "Forbidden"}), 403
        if not is_authorized_for(caller_id, employee_id):
            return jsonify({"message": "Forbidden"}), 403

        result, status = add_supervisor_diary(body)
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@diary_bp.patch("/<diary_id>/approve")
def approve_diary_route(diary_id):
    try:
        caller_id = require_auth(request)
        if not caller_id:
            return jsonify({"message": "Unauthorized"}), 401

        owner_id = _diary_owner(diary_id)
        if owner_id is None:
            return jsonify({"message": "Diary entry not found"}), 404
        # A supervisor must be strictly above the employee in the reporting
        # chain — is_authorized_for's self-access shortcut (caller == target)
        # is for read endpoints and must not let someone approve their own
        # entry, so it's explicitly excluded here.
        if caller_id == owner_id or not is_authorized_for(caller_id, owner_id):
            return jsonify({"message": "Forbidden"}), 403

        body = request.get_json(silent=True) or {}
        if caller_id != body.get("reviewer_id"):
            return jsonify({"message": "Forbidden"}), 403

        result, status = approve_diary(diary_id, body)
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@diary_bp.patch("/<diary_id>/reject")
def reject_diary_route(diary_id):
    try:
        caller_id = require_auth(request)
        if not caller_id:
            return jsonify({"message": "Unauthorized"}), 401

        owner_id = _diary_owner(diary_id)
        if owner_id is None:
            return jsonify({"message": "Diary entry not found"}), 404
        # See approve_diary_route: self-approval/self-rejection must be
        # excluded even though is_authorized_for allows caller == target.
        if caller_id == owner_id or not is_authorized_for(caller_id, owner_id):
            return jsonify({"message": "Forbidden"}), 403

        body = request.get_json(silent=True) or {}
        if caller_id != body.get("reviewer_id"):
            return jsonify({"message": "Forbidden"}), 403

        result, status = reject_diary(diary_id, body)
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@diary_bp.delete("/<diary_id>")
def delete_diary_route(diary_id):
    try:
        caller_id = require_auth(request)
        if not caller_id:
            return jsonify({"message": "Unauthorized"}), 401

        owner_id = _diary_owner(diary_id)
        if owner_id is None:
            return jsonify({"message": "Diary entry not found"}), 404
        if not is_authorized_for(caller_id, owner_id):
            return jsonify({"message": "Forbidden"}), 403

        result, status = delete_diary(diary_id)
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500
