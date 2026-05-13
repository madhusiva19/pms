"""
routes/pms_cycle_routes.py

HTTP endpoints for PMS cycle management and the debug-freeze helper.
"""

from flask import Blueprint, jsonify, request

from services.freeze_service import get_request_level
from services.pms_cycle_service import (
    get_all_pms_cycles,
    get_active_cycle_response,
    update_pms_cycle,
    create_pms_cycle,
    close_active_pms_cycle,
    open_next_pms_cycle,
    get_debug_freeze_info,
)

pms_cycle_bp = Blueprint("pms_cycle", __name__)

# seed_fn is injected at app startup via init_pms_cycle_routes()
_seed_fn = None


def init_pms_cycle_routes(seed_notifications_fn) -> None:
    global _seed_fn
    _seed_fn = seed_notifications_fn


# ── Debug ─────────────────────────────────────────────────────────────────────

@pms_cycle_bp.route("/debug-freeze", methods=["GET"])
def debug_freeze():
    try:
        return jsonify(get_debug_freeze_info()), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Read ──────────────────────────────────────────────────────────────────────

@pms_cycle_bp.route("/pms-cycles", methods=["GET"])
def get_pms_cycles():
    try:
        return jsonify(get_all_pms_cycles()), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@pms_cycle_bp.route("/pms-cycles/active", methods=["GET"])
def get_active_pms_cycle_route():
    try:
        return jsonify(get_active_cycle_response()), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ── Write ─────────────────────────────────────────────────────────────────────

@pms_cycle_bp.route("/pms-cycles/<int:cycle_id>", methods=["PUT"])
def update_pms_cycle_route(cycle_id):
    try:
        if get_request_level() > 1:
            return jsonify({"error": "Only HQ Admin can update PMS cycles."}), 403
        update_pms_cycle(cycle_id, request.get_json())
        return jsonify({"message": "PMS cycle updated"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@pms_cycle_bp.route("/pms-cycles", methods=["POST"])
def create_pms_cycle_route():
    try:
        if get_request_level() > 1:
            return jsonify({"error": "Only HQ Admin can create PMS cycles."}), 403
        cycle = create_pms_cycle(request.get_json(), _seed_fn)
        return jsonify(cycle), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@pms_cycle_bp.route("/pms-cycles/close", methods=["POST"])
def close_pms_cycle():
    try:
        if get_request_level() > 1:
            return jsonify({"error": "Only HQ Admin can close PMS cycles."}), 403
        cycle = close_active_pms_cycle()
        return jsonify({"message": f"PMS cycle {cycle['pms_year']} closed."}), 200
    except LookupError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@pms_cycle_bp.route("/pms-cycles/open-next", methods=["POST"])
def open_next_pms_cycle_route():
    try:
        if get_request_level() > 1:
            return jsonify({"error": "Only HQ Admin can open the next PMS cycle."}), 403
        data  = request.get_json() or {}
        cycle = open_next_pms_cycle(data, _seed_fn)
        return jsonify({"message": f"Cycle {cycle['pms_year']} opened.", "cycle": cycle}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400
