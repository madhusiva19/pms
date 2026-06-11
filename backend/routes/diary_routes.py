from flask import Blueprint, request, jsonify
from services.diary_service import (
    get_diary, save_diary, submit_diary, add_supervisor_diary,
    approve_diary, reject_diary, delete_diary,
)

diary_bp = Blueprint("diary", __name__, url_prefix="/api/diary")


@diary_bp.get("/<employee_id>")
def get_diary_route(employee_id):
    try:
        result, status = get_diary(employee_id)
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@diary_bp.post("/save")
def save_diary_route():
    try:
        result, status = save_diary(request.get_json(silent=True) or {})
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@diary_bp.post("/submit")
def submit_diary_route():
    try:
        result, status = submit_diary(request.get_json(silent=True) or {})
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@diary_bp.post("/supervisor")
def add_supervisor_diary_route():
    try:
        result, status = add_supervisor_diary(request.get_json(silent=True) or {})
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@diary_bp.patch("/<diary_id>/approve")
def approve_diary_route(diary_id):
    try:
        result, status = approve_diary(diary_id, request.get_json(silent=True) or {})
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@diary_bp.patch("/<diary_id>/reject")
def reject_diary_route(diary_id):
    try:
        result, status = reject_diary(diary_id, request.get_json(silent=True) or {})
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500


@diary_bp.delete("/<diary_id>")
def delete_diary_route(diary_id):
    try:
        result, status = delete_diary(diary_id)
        return jsonify(result), status
    except Exception as e:
        return jsonify({"message": str(e)}), 500
