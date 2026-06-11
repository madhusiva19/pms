"""
routes/template_routes.py

HTTP endpoints for templates, template variants, unfreeze exceptions,
the user-facing /my-templates endpoint, and the new HQ Admin
/template-variants global view.
"""

from flask import Blueprint, jsonify, request
from models.supabase_client import supabase

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
    rollover_cycle,
    get_cycle_template_count,
    copy_assignments_for_rolled_over_templates,
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
    get_all_variants_across_templates,
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
# CYCLE ROLLOVER & TEMPLATE COUNT
# ─────────────────────────────────────────────────────────────────────────────

@template_bp.route("/pms-cycles/rollover", methods=["POST"])
def pms_cycle_rollover_route():
    """
    HQ Admin only. Duplicates all templates from the previous cycle into
    the newly created cycle. Safe to call multiple times — idempotent.

    Body: { "old_cycle_id": <int>, "new_cycle_id": <int> }
    """
    try:
        if get_request_level() != 1:
            return jsonify({"error": "Only HQ Admin can trigger a cycle rollover."}), 403

        data   = request.get_json() or {}
        old_id = data.get("old_cycle_id")
        new_id = data.get("new_cycle_id")

        if not old_id or not new_id:
            return jsonify({"error": "old_cycle_id and new_cycle_id are required."}), 400
        if int(old_id) == int(new_id):
            return jsonify({"error": "old and new cycle IDs must differ."}), 400

        result = rollover_cycle(int(old_id), int(new_id))
        return jsonify({
            "message": f"Rolled over {result['copied']} template(s) to new cycle.",
            **result,
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400


@template_bp.route("/pms-cycles/<int:cycle_id>/template-count", methods=["GET"])
def pms_cycle_template_count_route(cycle_id):
    """Returns how many templates exist for a given PMS cycle."""
    try:
        count = get_cycle_template_count(cycle_id)
        return jsonify({"cycle_id": cycle_id, "count": count}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# COPY ASSIGNMENTS FROM PREVIOUS CYCLE
# ─────────────────────────────────────────────────────────────────────────────

@template_bp.route("/pms-cycles/copy-assignments", methods=["POST"])
def copy_assignments_route():
    """
    HQ Admin only.
    Copies assignment rules and user assignments from old cycle templates
    to new cycle templates.

    Idempotent — safe to call multiple times.
    If already applied → returns skipped=True.

    Body: { "old_cycle_id": <int>, "new_cycle_id": <int> }
    """
    try:
        if get_request_level() != 1:
            return jsonify({"error": "Only HQ Admin can copy assignments."}), 403

        data         = request.get_json() or {}
        old_cycle_id = data.get("old_cycle_id")
        new_cycle_id = data.get("new_cycle_id")

        if not old_cycle_id or not new_cycle_id:
            return jsonify({"error": "old_cycle_id and new_cycle_id are required."}), 400

        if int(old_cycle_id) == int(new_cycle_id):
            return jsonify({"error": "old_cycle_id and new_cycle_id must be different."}), 400

        result = copy_assignments_for_rolled_over_templates(
            int(old_cycle_id),
            int(new_cycle_id),
        )

        if result["skipped"]:
            return jsonify({
                "message":      "Assignments already applied — no changes made.",
                "copied_rules": 0,
                "copied_users": 0,
                "skipped":      True,
            }), 200

        return jsonify({
            "message":      f"Copied {result['copied_rules']} rules and {result['copied_users']} user assignments.",
            "copied_rules": result["copied_rules"],
            "copied_users": result["copied_users"],
            "skipped":      False,
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400


@template_bp.route("/pms-cycles/<int:cycle_id>/assignments-status", methods=["GET"])
def get_assignments_status_route(cycle_id):
    """
    Check if templates in a given cycle already have assignments.
    Frontend uses this to decide whether to show button as active or disabled.
    """
    try:
        if get_request_level() != 1:
            return jsonify({"error": "Only HQ Admin can check assignment status."}), 403

        templates_res = (
            supabase.table("templates")
            .select("id")
            .eq("pms_cycle_id", cycle_id)
            .execute()
            .data or []
        )

        if not templates_res:
            return jsonify({
                "cycle_id":           cycle_id,
                "has_assignments":    False,
                "assignments_copied": False,
            }), 200

        template_ids = [str(t["id"]) for t in templates_res]

        existing = (
            supabase.table("template_assignment_combinations")
            .select("id")
            .in_("template_id", template_ids)
            .limit(1)
            .execute()
            .data or []
        )

        has_assignments = bool(existing)

        return jsonify({
            "cycle_id":           cycle_id,
            "has_assignments":    has_assignments,
            "assignments_copied": has_assignments,
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# TEMPLATE VARIANT ROUTES  (per-template)
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
            "message":            f"Unfrozen {result['unfrozen']} scope(s).",
            "unfrozen_branches":  result["branch_ids"],
            "unfrozen_countries": result["country_ids"],
            "pms_cycle_id":       result["pms_cycle_id"],
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
        count         = bulk_delete_unfreeze_exceptions(template_id, exception_ids)
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


# ─────────────────────────────────────────────────────────────────────────────
# GLOBAL VARIANTS VIEW  (HQ Admin only)
# ─────────────────────────────────────────────────────────────────────────────

def _parse_id_list(param: str | None) -> list[str]:
    if not param:
        return []
    return [x.strip() for x in param.split(",") if x.strip()]


@template_bp.route("/template-variants", methods=["GET"])
def get_all_variants_route():
    try:
        if get_request_level() != 1:
            return jsonify({"error": "Only HQ Admin can access the global variants view."}), 403

        filters = {
            "template_ids":  _parse_id_list(request.args.get("template_ids")),
            "branch_ids":    _parse_id_list(request.args.get("branch_ids")),
            "country_ids":   _parse_id_list(request.args.get("country_ids")),
            "pms_cycle_ids": _parse_id_list(request.args.get("pms_cycle_ids")),
        }

        variants = get_all_variants_across_templates(filters)
        return jsonify(variants), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@template_bp.route("/template-variants/summary", methods=["GET"])
def get_variants_summary_route():
    try:
        if get_request_level() != 1:
            return jsonify({"error": "Only HQ Admin can access the global variants view."}), 403

        all_variants = get_all_variants_across_templates()
        summary = {
            "total":        len(all_variants),
            "by_branch":    sum(1 for v in all_variants if v.get("branch_id")),
            "by_country":   sum(1 for v in all_variants if v.get("country_id")),
            "past_cycle":   sum(1 for v in all_variants if v.get("is_past_cycle")),
            "active_cycle": sum(1 for v in all_variants if not v.get("is_past_cycle")),
        }
        return jsonify(summary), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@template_bp.route("/template-variants/<int:variant_id>", methods=["DELETE"])
def delete_variant_global_route(variant_id):
    try:
        if get_request_level() != 1:
            return jsonify({"error": "Only HQ Admin can delete variants."}), 403

        data        = request.get_json(silent=True) or {}
        template_id = request.args.get("template_id") or data.get("template_id")

        if not template_id:
            return jsonify({"error": "template_id is required (query param or body)."}), 400

        template_id = int(template_id)

        if is_template_from_past_cycle(template_id):
            return jsonify({"error": "Past-cycle variants cannot be deleted."}), 403

        delete_template_variant(template_id, variant_id)
        return jsonify({"message": "Variant deleted. Branch/country will use the main template."}), 200
    except LookupError as e:
        return jsonify({"error": str(e)}), 404
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 400