"""
routes/template_routes.py

HTTP endpoints for templates, template variants, unfreeze exceptions,
and the user-facing /my-templates endpoint.
"""

from flask import Blueprint, jsonify, request

from services.freeze_service import (
    get_request_level,
    can_role_edit,
    get_freeze_status,
    is_template_from_past_cycle,
    get_active_pms_cycle,
)
from services.template_service import (
    get_all_templates,
    get_single_template,
    create_template,
    update_template,
    delete_template,
    list_template_variants,
    create_template_variant,
    get_template_variant,
    update_template_variant,
    delete_template_variant,
    get_unfreeze_exceptions,
    create_unfreeze_exceptions,
    bulk_delete_unfreeze_exceptions,
    delete_single_unfreeze_exception,
    get_my_templates,
)

template_bp = Blueprint("template", __name__)


# ─────────────────────────────────────────────────────────────────────────────
# TEMPLATE CRUD
# ─────────────────────────────────────────────────────────────────────────────

@template_bp.route("/templates", methods=["POST"])
def save_template():
    try:
        result = create_template(request.get_json())
        return jsonify({"message": "Template saved!", "id": result["id"]}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@template_bp.route("/templates", methods=["GET"])
def get_templates():
    try:
        return jsonify(get_all_templates()), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@template_bp.route("/templates/<int:template_id>", methods=["GET"])
def get_single_template_route(template_id):
    try:
        return jsonify(get_single_template(template_id)), 200
    except LookupError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@template_bp.route("/templates/<int:template_id>", methods=["PUT"])
def update_template_route(template_id):
    try:
        if is_template_from_past_cycle(template_id):
            return jsonify({"error": "This template belongs to a past PMS cycle and is permanently frozen."}), 403

        level         = get_request_level()
        unfreeze_mode = request.headers.get("X-Unfreeze-Mode", "0") == "1"

        if unfreeze_mode and level == 1:
            active = get_active_pms_cycle()
            if active:
                exceptions = get_unfreeze_exceptions(template_id, active["id"])
                if not exceptions:
                    return jsonify({"error": "No active unfreeze exceptions — cannot edit frozen template."}), 403
            else:
                return jsonify({"error": "No active PMS cycle."}), 403
        elif not can_role_edit(level):
            status = get_freeze_status()
            return jsonify({
                "error": "Templates are fully frozen — no changes permitted."
                if status == "frozen"
                else "Only HQ Admin can edit during the grace period."
            }), 403

        update_template(template_id, request.get_json())
        return jsonify({"message": "Template updated successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@template_bp.route("/templates/<int:template_id>", methods=["DELETE"])
def delete_template_route(template_id):
    try:
        if is_template_from_past_cycle(template_id):
            return jsonify({"error": "Cannot delete — past-cycle template is permanently frozen."}), 403
        if not can_role_edit(get_request_level()):
            return jsonify({"error": "Cannot delete — template is frozen or you lack permission."}), 403
        delete_template(template_id)
        return jsonify({"message": "Template deleted successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# TEMPLATE VARIANT ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@template_bp.route("/templates/<int:template_id>/variants", methods=["GET"])
def list_variants(template_id):
    try:
        if get_request_level() != 1:
            return jsonify({"error": "Only HQ Admin can view variants."}), 403
        return jsonify(list_template_variants(template_id)), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@template_bp.route("/templates/<int:template_id>/variants", methods=["POST"])
def create_variant(template_id):
    try:
        if get_request_level() != 1:
            return jsonify({"error": "Only HQ Admin can create variants."}), 403
        if is_template_from_past_cycle(template_id):
            return jsonify({"error": "Cannot create variant for past-cycle template."}), 403
        variant = create_template_variant(template_id, request.get_json() or {})
        return jsonify({"message": "Variant created successfully.", "variant": variant}), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    except FileExistsError as e:
        msg, vid = str(e).split("|")
        return jsonify({"error": msg, "variant_id": int(vid)}), 409
    except LookupError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@template_bp.route("/templates/<int:template_id>/variants/<int:variant_id>", methods=["GET"])
def get_variant(template_id, variant_id):
    try:
        if get_request_level() != 1:
            return jsonify({"error": "Only HQ Admin can view variants."}), 403
        return jsonify(get_template_variant(template_id, variant_id)), 200
    except LookupError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@template_bp.route("/templates/<int:template_id>/variants/<int:variant_id>", methods=["PUT"])
def update_variant(template_id, variant_id):
    try:
        if get_request_level() != 1:
            return jsonify({"error": "Only HQ Admin can edit variants."}), 403
        if is_template_from_past_cycle(template_id):
            return jsonify({"error": "Past-cycle variants are permanently frozen."}), 403
        update_template_variant(template_id, variant_id, request.get_json())
        return jsonify({"message": "Variant updated successfully."}), 200
    except LookupError as e:
        return jsonify({"error": str(e)}), 404
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@template_bp.route("/templates/<int:template_id>/variants/<int:variant_id>", methods=["DELETE"])
def delete_variant(template_id, variant_id):
    try:
        if get_request_level() != 1:
            return jsonify({"error": "Only HQ Admin can delete variants."}), 403
        if is_template_from_past_cycle(template_id):
            return jsonify({"error": "Past-cycle variants cannot be deleted."}), 403
        delete_template_variant(template_id, variant_id)
        return jsonify({"message": "Variant deleted. Branch will use the main template."}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# UNFREEZE EXCEPTION ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@template_bp.route("/templates/<int:template_id>/unfreeze-exceptions", methods=["GET"])
def get_template_unfreeze_exceptions(template_id):
    try:
        if get_request_level() != 1:
            return jsonify({"error": "Only HQ Admin can view unfreeze exceptions."}), 403
        if is_template_from_past_cycle(template_id):
            return jsonify({"error": "Past-cycle templates cannot be unfrozen."}), 403
        active = get_active_pms_cycle()
        if not active:
            return jsonify([]), 200
        return jsonify(get_unfreeze_exceptions(template_id, active["id"])), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@template_bp.route("/templates/<int:template_id>/unfreeze-exceptions", methods=["POST"])
def create_unfreeze_exceptions_route(template_id):
    try:
        if get_request_level() != 1:
            return jsonify({"error": "Only HQ Admin can manage unfreeze exceptions."}), 403
        if is_template_from_past_cycle(template_id):
            return jsonify({"error": "Past-cycle templates cannot be unfrozen."}), 403
        if get_freeze_status() not in ("frozen", "grace"):
            return jsonify({"error": "Template is not frozen — unfreeze is not applicable."}), 400
        result = create_unfreeze_exceptions(template_id, request.get_json() or {})
        return jsonify({
            "message":           f"Unfrozen {result['unfrozen']} scope(s).",
            "unfrozen_branches": result["branch_ids"],
            "unfrozen_countries": result["country_ids"],
            "pms_cycle_id":      result["pms_cycle_id"],
        }), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except LookupError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@template_bp.route("/templates/<int:template_id>/unfreeze-exceptions/bulk-delete", methods=["POST"])
def bulk_delete_unfreeze_exceptions_route(template_id):
    try:
        if get_request_level() != 1:
            return jsonify({"error": "Only HQ Admin can manage unfreeze exceptions."}), 403
        if is_template_from_past_cycle(template_id):
            return jsonify({"error": "Past-cycle templates cannot be modified."}), 403
        data          = request.get_json() or {}
        exception_ids = data.get("exception_ids") or []
        count = bulk_delete_unfreeze_exceptions(template_id, exception_ids)
        return jsonify({"message": f"Re-frozen {count} scope(s)."}), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@template_bp.route("/templates/<int:template_id>/unfreeze-exceptions/<int:exception_id>", methods=["DELETE"])
def delete_unfreeze_exception(template_id, exception_id):
    try:
        if get_request_level() != 1:
            return jsonify({"error": "Only HQ Admin can manage unfreeze exceptions."}), 403
        if is_template_from_past_cycle(template_id):
            return jsonify({"error": "Past-cycle templates cannot be modified."}), 403
        delete_single_unfreeze_exception(template_id, exception_id)
        return jsonify({"message": "Scope re-frozen successfully."}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# MY TEMPLATES  (user-facing)
# ─────────────────────────────────────────────────────────────────────────────

@template_bp.route("/my-templates", methods=["GET"])
def get_my_templates_route():
    try:
        user_id = request.args.get("user_id", "").strip()
        if not user_id:
            return jsonify({"error": "user_id is required"}), 400
        return jsonify(get_my_templates(user_id)), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400
