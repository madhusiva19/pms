"""
routes/pms_cycle_routes.py

HTTP endpoints for PMS cycle management and the debug-freeze helper.

"""

from flask import Blueprint, jsonify, request

from services.freeze_service import get_request_level
from services.pms_cycle_service import (
    close_active_pms_cycle,
    create_pms_cycle,
    get_active_cycle_response,
    get_all_pms_cycles,
    get_debug_freeze_info,
    open_next_pms_cycle,
    update_pms_cycle,
)


# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

# Access level above which requests are rejected as unauthorised
HQ_ADMIN_LEVEL = 1

# Human-readable permission error shown to non-HQ users
ERR_HQ_ONLY = "Only HQ Admin can perform this action."


# ─────────────────────────────────────────────────────────────────────────────
# BLUEPRINT SETUP
# ─────────────────────────────────────────────────────────────────────────────

pms_cycle_bp = Blueprint("pms_cycle", __name__)

# seed_fn is injected at app startup via init_pms_cycle_routes()
_seed_fn = None


def init_pms_cycle_routes(seed_notifications_fn) -> None:
    """
    Inject the notification-seeding callable used when creating or advancing cycles.

    """
    global _seed_fn
    _seed_fn = seed_notifications_fn


# ─────────────────────────────────────────────────────────────────────────────
# INTERNAL HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _require_hq_admin():
    """
    Return a 403 error response if the caller is not an HQ Admin, otherwise None.

    """
    if get_request_level() > HQ_ADMIN_LEVEL:
        return jsonify({"error": ERR_HQ_ONLY}), 403
    return None


def _error(message: str, status: int):
    """
    Shorthand for returning a JSON error response.

    """
    return jsonify({"error": message}), status


# ─────────────────────────────────────────────────────────────────────────────
# DEBUG
# ─────────────────────────────────────────────────────────────────────────────

@pms_cycle_bp.route("/debug-freeze", methods=["GET"])
def debug_freeze():
    """Return diagnostic information about the current freeze state."""
    try:
        return jsonify(get_debug_freeze_info()), 200
    except Exception as e:
        return _error(str(e), 500)


# ─────────────────────────────────────────────────────────────────────────────
# READ
# ─────────────────────────────────────────────────────────────────────────────

@pms_cycle_bp.route("/pms-cycles", methods=["GET"])
def get_pms_cycles():
    """Return all PMS cycles ordered by year descending."""
    try:
        return jsonify(get_all_pms_cycles()), 200
    except Exception as e:
        return _error(str(e), 400)


@pms_cycle_bp.route("/pms-cycles/active", methods=["GET"])
def get_active_pms_cycle_route():
    """Return the active PMS cycle with computed freeze and review dates."""
    try:
        return jsonify(get_active_cycle_response()), 200
    except Exception as e:
        return _error(str(e), 400)


# ─────────────────────────────────────────────────────────────────────────────
# WRITE
# ─────────────────────────────────────────────────────────────────────────────

@pms_cycle_bp.route("/pms-cycles/<int:cycle_id>", methods=["PUT"])
def update_pms_cycle_route(cycle_id):
    try:
        guard = _require_hq_admin()
        if guard:
            return guard

        # Pass _seed_fn so rollover fires immediately if year_end_review is past
        update_pms_cycle(cycle_id, request.get_json(), _seed_fn)
        return jsonify({"message": "PMS cycle updated"}), 200
    except Exception as e:
        return _error(str(e), 400)


@pms_cycle_bp.route("/pms-cycles", methods=["POST"])
def create_pms_cycle_route():
    """Create a new PMS cycle for the given year and seed its notifications. HQ Admin only."""
    try:
        guard = _require_hq_admin()
        if guard:
            return guard

        cycle = create_pms_cycle(request.get_json(), _seed_fn)
        return jsonify(cycle), 200
    except ValueError as e:
        return _error(str(e), 400)
    except Exception as e:
        return _error(str(e), 400)


@pms_cycle_bp.route("/pms-cycles/close", methods=["POST"])
def close_pms_cycle():
    """Close the currently active PMS cycle. HQ Admin only."""
    try:
        guard = _require_hq_admin()
        if guard:
            return guard

        cycle = close_active_pms_cycle()
        return jsonify({"message": f"PMS cycle {cycle['pms_year']} closed."}), 200
    except LookupError as e:
        return _error(str(e), 404)
    except Exception as e:
        return _error(str(e), 400)


@pms_cycle_bp.route("/pms-cycles/open-next", methods=["POST"])
def open_next_pms_cycle_route():
    """Close the current cycle and open the next year's cycle. HQ Admin only."""
    try:
        guard = _require_hq_admin()
        if guard:
            return guard

        data  = request.get_json() or {}
        cycle = open_next_pms_cycle(data, _seed_fn)
        return jsonify({"message": f"Cycle {cycle['pms_year']} opened.", "cycle": cycle}), 200
    except Exception as e:
        return _error(str(e), 400)
    

@pms_cycle_bp.route("/api/pms-cycle/current", methods=["GET"])
def get_pms_cycle_current():
    """
    Compatibility endpoint for ViewTemplate.tsx edit-permission checks.
    editing_open is true only while the objective-setting window is open —
    grace period is reserved for HQ Admin corrections, not general template editing.
    """
    try:
        data = get_active_cycle_response()
        from datetime import date
        today = date.today().isoformat()
        obj_end = data.get("objective_setting_end")
        editing_open = bool(obj_end) and today < obj_end
        return jsonify({
            "cycle": data,
            "editing_open": editing_open,
            "reason": None if editing_open else "Objective setting window has closed for this cycle.",
            "objective_setting_end": data.get("objective_setting_end"),
            "grace_period_end": data.get("grace_period_end"),
        }), 200
    except Exception as e:
        return _error(str(e), 400)

