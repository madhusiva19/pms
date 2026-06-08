"""
routes/templates.py
--------------------
Flask Blueprint for all template-related endpoints.

Endpoints
---------
GET  /api/templates                              List all templates
GET  /api/templates/<id>                         Single template with categories + objectives
PUT  /api/templates/<id>/update                  Save edits (weights, new objectives)
DEL  /api/templates/<id>/objectives/<obj_id>     Delete a single objective
POST /api/templates/<id>/assign                  Set the employee assignment list
GET  /api/templates/<id>/assignments             List employees assigned to a template
GET  /api/employees                              Search employees by name (scoped to manager)
GET  /api/employees/<user_id>/assignment         Get a single employee's current template
GET  /api/kpi-scales                             Full KPI scale catalogue
"""

import traceback

from flask import Blueprint, jsonify, request

from utils.db import LOCKED_ADMIN_UUID, supabase

templates_bp = Blueprint("templates", __name__)


# ---------------------------------------------------------------------------
# Template listing and detail
# ---------------------------------------------------------------------------

def _resolve_variant(template_id: int, country_id: str | None, branch_id: str | None,
                     department_id: str | None, sub_department_id: str | None) -> dict | None:
    """
    Find the most specific template_variant for this user's org unit.
    Priority: sub_department > department > branch > country (most specific wins).
    Returns the variant row or None if no variant exists.
    """
    res = (
        supabase.table("template_variants")
        .select("*")
        .eq("parent_template_id", template_id)
        .execute()
    )
    variants = res.data or []
    if not variants:
        return None

    # Score each variant by specificity — higher = more specific match
    def specificity(v: dict) -> int:
        if sub_department_id and v.get("sub_department_id") == sub_department_id:
            return 4
        if department_id and v.get("department_id") == department_id:
            return 3
        if branch_id and v.get("branch_id") == branch_id:
            return 2
        if country_id and v.get("country_id") == country_id:
            return 1
        return 0

    best = max(variants, key=specificity)
    return best if specificity(best) > 0 else None


@templates_bp.route("/api/templates", methods=["GET"])
def get_templates():
    """
    Return all templates with freeze status and content resolved per requesting user's org unit.

    Freeze logic: derived from pms_cycles dates, NOT templates.status.
    Templates are 'active' when today falls between objective_setting_start
    and grace_period_end. Outside that window they are 'frozen'.

    Unfreeze override: if a template_unfreezes row exists for the user's org unit,
    that template is returned as 'active' regardless of the cycle dates.

    Variant resolution: if a template_variant exists for the user's org unit, its
    name/description overrides the base template row.
    Resolution priority: sub_department > department > branch > country.
    """
    try:
        from datetime import date
        country_id        = request.args.get("country_id")
        branch_id         = request.args.get("branch_id")
        department_id     = request.args.get("department_id")
        sub_department_id = request.args.get("sub_department_id")

        result    = supabase.table("templates").select("*").execute()
        templates = result.data or []

        # Derive global freeze status from pms_cycles dates, not templates.status.
        # Templates are active only during the objective setting window.
        cycle_res = (
            supabase.table("pms_cycles")
            .select("objective_setting_start, objective_setting_end, grace_period_end")
            .eq("is_active", True)
            .order("pms_year", desc=True)
            .limit(1)
            .execute()
        )
        cycle = (cycle_res.data or [{}])[0]
        today = date.today()

        obj_start = cycle.get("objective_setting_start")
        obj_end   = cycle.get("objective_setting_end")
        # Templates are active only within the objective setting window.
        # grace_period_end is only for new template creation by HQ Admin — not for freeze status.
        cycle_active = (
            obj_start and obj_end and
            date.fromisoformat(obj_start) <= today <= date.fromisoformat(obj_end)
        )

        # Apply global freeze status to all templates
        for t in templates:
            t["status"] = "active" if cycle_active else "frozen"

        has_org = any([country_id, branch_id, department_id, sub_department_id])

        if has_org:
            all_template_ids = [t["id"] for t in templates]

            # Unfreeze override — only relevant when cycle window is closed.
            # If HQ Admin has unfrozen a template for this user's org unit,
            # override the frozen status back to active.
            unfrozen_for_user: set = set()
            if not cycle_active:
                uf_res = (
                    supabase.table("template_unfreezes")
                    .select("template_id, branch_id, country_id")
                    .in_("template_id", all_template_ids)
                    .execute()
                )
                for row in (uf_res.data or []):
                    if branch_id and row.get("branch_id") == branch_id:
                        unfrozen_for_user.add(row["template_id"])
                    elif country_id and row.get("country_id") == country_id:
                        unfrozen_for_user.add(row["template_id"])

            # Variant resolution
            var_res = (
                supabase.table("template_variants")
                .select("*")
                .in_("parent_template_id", all_template_ids)
                .execute()
            )
            variants_by_template: dict = {}
            for v in (var_res.data or []):
                variants_by_template.setdefault(v["parent_template_id"], []).append(v)

            def best_variant(tid: int) -> dict | None:
                candidates = variants_by_template.get(tid, [])
                if not candidates:
                    return None
                def score(v: dict) -> int:
                    if sub_department_id and v.get("sub_department_id") == sub_department_id: return 4
                    if department_id     and v.get("department_id")     == department_id:     return 3
                    if branch_id         and v.get("branch_id")         == branch_id:         return 2
                    if country_id        and v.get("country_id")        == country_id:        return 1
                    return 0
                best = max(candidates, key=score)
                return best if score(best) > 0 else None

            # Apply overrides
            for t in templates:
                tid = t["id"]
                if tid in unfrozen_for_user:
                    t["status"] = "active"
                variant = best_variant(tid)
                if variant:
                    t["name"]        = variant.get("name")        or t["name"]
                    t["description"] = variant.get("description") or t.get("description")
                    t["variant_id"]  = variant["id"]
                    t["has_variant"] = True

        return jsonify(templates)

    except Exception as exc:
        print(f"[ERROR] get_templates: {exc}")
        return jsonify({"error": str(exc)}), 500


@templates_bp.route("/api/templates/<int:template_id>", methods=["GET"])
def get_template(template_id: int):
    """
    Return a single template with its categories and objectives.

    Tries to include `kpi_scale` on objectives; falls back gracefully
    if that column does not exist yet in the DB schema.
    """
    try:
        tmpl_res = (
            supabase.table("templates")
            .select("*")
            .eq("id", template_id)
            .execute()
        )

        if not tmpl_res.data:
            return jsonify({"error": "Template not found"}), 404

        template = tmpl_res.data[0]

        cat_res = (
            supabase.table("categories")
            .select("*")
            .eq("template_id", template_id)
            .order("id")
            .execute()
        )
        categories = cat_res.data or []
        cat_ids    = [c["id"] for c in categories]

        all_objectives: list[dict] = []
        if cat_ids:
            try:
                obj_res = (
                    supabase.table("objectives")
                    .select("id, name, weight, max_score, control_type, category_id, kpi_scale")
                    .in_("category_id", cat_ids)
                    .execute()
                )
            except Exception:
                # Fallback for schemas without kpi_scale column
                obj_res = (
                    supabase.table("objectives")
                    .select("id, name, weight, max_score, control_type, category_id")
                    .in_("category_id", cat_ids)
                    .execute()
                )
            all_objectives = obj_res.data or []

        for cat in categories:
            cat["objectives"] = [
                o for o in all_objectives if o["category_id"] == cat["id"]
            ]

        template["categories"] = categories
        return jsonify(template)

    except Exception as exc:
        return jsonify({"error": str(exc), "detail": traceback.format_exc()}), 500


# ---------------------------------------------------------------------------
# Template editing
# ---------------------------------------------------------------------------

@templates_bp.route("/api/templates/<int:template_id>/update", methods=["PUT"])
def update_template(template_id: int):
    """
    Persist template edits.

    HQ Admin  → modifies global objectives directly (affects everyone).
    Other roles → upserts a template_variants row scoped to their org unit
                  so changes only affect users under their branch/dept/sub-dept.

    Scope priority: sub_department > department > branch > country.
    """
    try:
        body = request.get_json()

        if not body or "categories" not in body:
            return jsonify({"error": "Invalid payload — 'categories' key required"}), 400

        editor_role       = body.get("editor_role", "")
        country_id        = body.get("country_id")
        branch_id         = body.get("branch_id")
        department_id     = body.get("department_id")
        sub_department_id = body.get("sub_department_id")
        editor_id         = body.get("editor_id")

        if editor_role == "hq_admin":
            # HQ Admin modifies global objectives directly
            for cat in body["categories"]:
                for obj in cat.get("objectives", []):
                    if obj.get("isNew"):
                        supabase.table("objectives").insert({
                            "name":         obj["name"],
                            "weight":       obj["weight"],
                            "max_score":    obj.get("max_score", 5),
                            "control_type": obj["control_type"],
                            "category_id":  obj["category_id"],
                            "kpi_scale":    obj.get("kpi_scale"),
                        }).execute()
                    else:
                        supabase.table("objectives").update(
                            {"weight": obj["weight"]}
                        ).eq("id", obj["id"]).execute()
            return jsonify({"success": True, "mode": "global"})

        # Non-HQ: upsert a variant scoped to the most specific org unit
        scope = {
            "country_id":        None,
            "branch_id":         None,
            "department_id":     None,
            "sub_department_id": None,
        }
        if sub_department_id:
            scope["sub_department_id"] = sub_department_id
        elif department_id:
            scope["department_id"] = department_id
        elif branch_id:
            scope["branch_id"] = branch_id
        elif country_id:
            scope["country_id"] = country_id

        # Check if a variant already exists for this template + scope
        existing_q = (
            supabase.table("template_variants")
            .select("id")
            .eq("parent_template_id", template_id)
        )
        for k, v in scope.items():
            existing_q = existing_q.eq(k, v) if v else existing_q.is_(k, "null")
        existing = existing_q.limit(1).execute()

        # Fetch base template metadata for the variant row
        base = (
            supabase.table("templates")
            .select("name, description, max_score, total_weight")
            .eq("id", template_id)
            .single()
            .execute()
        ).data or {}

        variant_row = {
            "parent_template_id": template_id,
            "template_content":   body["categories"],
            "name":               body.get("name") or base.get("name"),
            "description":        body.get("description") or base.get("description"),
            "max_score":          body.get("max_score") or base.get("max_score", 5),
            "total_weight":       body.get("total_weight") or base.get("total_weight", 100),
            "created_by":         editor_id,
            **scope,
        }

        if existing.data:
            variant_id = existing.data[0]["id"]
            supabase.table("template_variants").update({
                "template_content": body["categories"],
                "name":             variant_row["name"],
            }).eq("id", variant_id).execute()
            return jsonify({"success": True, "mode": "variant_updated", "variant_id": variant_id})
        else:
            insert_res = supabase.table("template_variants").insert(variant_row).execute()
            variant_id = insert_res.data[0]["id"] if insert_res.data else None
            return jsonify({"success": True, "mode": "variant_created", "variant_id": variant_id})

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@templates_bp.route(
    "/api/templates/<int:template_id>/objectives/<int:obj_id>",
    methods=["DELETE"],
)
def delete_objective(template_id: int, obj_id: int):
    """Hard-delete a single objective row."""
    try:
        supabase.table("objectives").delete().eq("id", obj_id).execute()
        return jsonify({"success": True})

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ---------------------------------------------------------------------------
# Employee assignment
# ---------------------------------------------------------------------------

@templates_bp.route("/api/templates/<int:template_id>/assign", methods=["POST"])
def assign_employees(template_id: int):
    """
    Replace the full assignment list for a template.

    Rules
    -----
    - LOCKED_ADMIN_UUID can never be reassigned from this endpoint.
    - Employees already on another template are automatically moved here.
    - The list must contain at least one id.
    """
    try:
        body = request.get_json()

        if not body:
            return jsonify({"error": "Invalid payload"}), 400

        requested_ids = [str(uid) for uid in body.get("employee_ids", [])]

        if LOCKED_ADMIN_UUID in requested_ids:
            return jsonify({
                "error": (
                    "This user is assigned to a template by their superior "
                    "and cannot be reassigned from this page."
                ),
                "locked_employee_id": LOCKED_ADMIN_UUID,
            }), 403

        if not requested_ids:
            return jsonify({
                "error": (
                    "employee_ids cannot be empty. "
                    "Pass at least one employee ID to assign."
                )
            }), 400

        # Remove these employees from any other template first
        (
            supabase.table("template_assignments")
            .delete()
            .in_("user_id", requested_ids)
            .neq("template_id", template_id)
            .execute()
        )

        # Clear existing assignments for THIS template (preserve locked admin)
        (
            supabase.table("template_assignments")
            .delete()
            .eq("template_id", template_id)
            .neq("user_id", LOCKED_ADMIN_UUID)
            .execute()
        )

        rows = [
            {"template_id": template_id, "user_id": uid}
            for uid in requested_ids
        ]
        supabase.table("template_assignments").insert(rows).execute()

        return jsonify({
            "success":  True,
            "assigned": len(requested_ids),
            "message": (
                f"{len(requested_ids)} employee(s) assigned to template {template_id}. "
                "Any prior assignments on other templates were automatically removed."
            ),
        })

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@templates_bp.route("/api/templates/<int:template_id>/assignments", methods=["GET"])
def get_assignments(template_id: int):
    """
    List employees assigned to a template.

    When a ``manager_id`` query param is supplied the list is filtered to
    only that manager's direct reports.  This is the fix for the bug where
    all globally assigned employees were shown instead of just the current
    manager's team members.

    Both TemplateManagement.tsx (card count) and ViewTemplate.tsx (assigned
    list panel) pass manager_id, so both views are now correctly scoped.
    """
    try:
        manager_id = request.args.get("manager_id", "").strip()

        # Fetch all assignments for this template
        result = (
            supabase.table("template_assignments")
            .select("user_id, users!template_assignments_user_id_fkey(id, full_name, designation_id, designations!fk_designation(name))")
            .eq("template_id", template_id)
            .execute()
        )

        # When manager_id is provided, resolve their direct reports and
        # use that set to filter the assignment list
        if manager_id:
            team_res = (
                supabase.table("users")
                .select("id")
                .eq("manager_id", manager_id)
                .execute()
            )
            team_ids: set[str] | None = {u["id"] for u in (team_res.data or [])}
        else:
            # No manager filter — return all assigned employees (admin use)
            team_ids = None

        employees = []
        for row in result.data:
            user = row.get("users")
            if not user:
                continue
            # Skip employees who are not in this manager's team
            if team_ids is not None and user["id"] not in team_ids:
                continue
            employees.append({
                "id":          user["id"],
                "name":        user["full_name"],
                "designation": (user.get("designations") or {}).get("name", ""),
            })

        return jsonify(employees)

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ---------------------------------------------------------------------------
# Employee search
# ---------------------------------------------------------------------------

@templates_bp.route("/api/employees", methods=["GET"])
def search_employees():
    """
    Full-text search for employees by name (case-insensitive ILIKE).

    The ``manager_id`` query param scopes results to only that manager's
    direct reports.  This fixes the original bug where the search always
    used LOCKED_ADMIN_UUID as the manager filter, returning the wrong set
    of employees for every other manager in the system.

    Returns up to 10 results, each enriched with their current template
    assignment so the UI can warn about conflicts before reassigning.
    """
    query      = request.args.get("search",     "").strip()
    manager_id = request.args.get("manager_id", "").strip()

    if not query:
        return jsonify([])

    try:
        user_query = (
            supabase.table("users")
            .select("id, full_name, designation_id, designations!fk_designation(name)")
            .ilike("full_name", f"%{query}%")
            .limit(10)
        )

        # Scope search results to this manager's direct reports only
        if manager_id:
            user_query = user_query.eq("manager_id", manager_id)

        user_res = user_query.execute()
        users    = user_res.data or []

        if not users:
            return jsonify([])

        # Enrich each result with their current template assignment
        user_ids   = [u["id"] for u in users]
        assign_res = (
            supabase.table("template_assignments")
            .select("user_id, template_id, templates(id, name)")
            .in_("user_id", user_ids)
            .execute()
        )

        assign_by_user: dict = {}
        for row in assign_res.data or []:
            assign_by_user[row["user_id"]] = {
                "template_id":   row["template_id"],
                "template_name": (
                    row["templates"]["name"] if row.get("templates") else None
                ),
            }

        result = []
        for user in users:
            assignment = assign_by_user.get(user["id"])
            result.append({
                "id":                    user["id"],
                "name":                  user["full_name"],
                "designation":           (user.get("designations") or {}).get("name", ""),
                "current_template_id":   assignment["template_id"]   if assignment else None,
                "current_template_name": assignment["template_name"] if assignment else None,
            })

        return jsonify(result)

    except Exception as exc:
        print(f"[ERROR] search_employees: {exc}")
        return jsonify({"error": str(exc)}), 500


@templates_bp.route("/api/employees/<user_id>/assignment", methods=["GET"])
def get_employee_assignment(user_id: str):
    """Return the current template assignment for a single employee."""
    try:
        result = (
            supabase.table("template_assignments")
            .select("template_id, templates(id, name)")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )

        if result.data:
            row = result.data[0]
            return jsonify({
                "assigned":      True,
                "template_id":   row["template_id"],
                "template_name": (
                    row["templates"]["name"] if row.get("templates") else None
                ),
            })

        return jsonify({"assigned": False, "template_id": None, "template_name": None})

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ---------------------------------------------------------------------------
# KPI scale catalogue
# ---------------------------------------------------------------------------

@templates_bp.route("/api/kpi-scales", methods=["GET"])
def get_kpi_scales():
    """
    Return the full KPI scale catalogue with metadata sourced from the DB.

    Each entry contains the scale key, human-readable label, group name,
    and technical parameters (scale_type, input_type, ll, ul, inverse).
    """
    try:
        # Human-readable label and display group for each scale key
        SCALE_META: dict[str, tuple[str, str]] = {
            "financial_achievement": ("Financial Achievement",        "Interpolated"),
            "to_gp_contribution":    ("T/O & GP Contribution",        "Interpolated"),
            "effective_sales_ratio": ("Effective Sales Ratio",        "Interpolated"),
            "individual_gp_margin":  ("Individual GP Margin %",       "Interpolated"),
            "ees_360":               ("EES / 360 Degree Feedback",    "Interpolated"),
            "nps_ccr":               ("NPS / CCR Score",              "Interpolated"),
            "employee_retention":    ("Employee Retention",           "Interpolated"),
            "overall_dpam":          ("Overall DPAM Score",           "Interpolated"),
            "statutory_legal_dpam":  ("Statutory & Legal Compliance", "Bracket"),
            "wip_score":             ("WIP Score (Days)",              "Bracket"),
            "operations_score":      ("Operations Score / DPAM Ops",  "Bracket"),
            "individual_sales_gp":   ("Individual Sales GP",          "Bracket"),
            "manual":                ("Manual Rating (1-5)",           "Manual"),
        }
        # Preserves the canonical display order for the frontend picker
        SORT_ORDER = list(SCALE_META.keys())

        # Fetch all objectives that have a kpi_scale assigned so we can
        # look up their actual mapping parameters (ll, ul, scale_type, etc.)
        obj_rows = (
            supabase.table("objectives")
            .select("id, kpi_scale")
            .not_.is_("kpi_scale", "null")
            .execute()
            .data
            or []
        )

        # Group objective IDs by scale key for batch mapping lookup
        scale_to_obj_ids: dict[str, list] = {}
        for obj in obj_rows:
            sk = obj.get("kpi_scale")
            if sk:
                scale_to_obj_ids.setdefault(sk, []).append(obj["id"])

        all_obj_ids = [oid for ids in scale_to_obj_ids.values() for oid in ids]
        mapping_rows: list[dict] = []

        if all_obj_ids:
            mapping_rows = (
                supabase.table("kpi_scale_mappings")
                .select("objective_id, scale_type, input_type, ll, ul, inverse")
                .in_("objective_id", all_obj_ids)
                .execute()
                .data
                or []
            )

        # Index mapping rows by objective_id for O(1) lookup
        mapping_by_obj: dict = {m["objective_id"]: m for m in mapping_rows}
        seen: set[str]       = set()
        catalogue: list[dict] = []

        for scale_key, obj_ids in scale_to_obj_ids.items():
            if scale_key in seen:
                continue
            seen.add(scale_key)

            # Take the first matching mapping row as representative parameters for this scale
            mapping = next(
                (mapping_by_obj[oid] for oid in obj_ids if oid in mapping_by_obj),
                {},
            )

            label, group_name = SCALE_META.get(scale_key, (scale_key, "Other"))
            catalogue.append({
                "scale_key":  scale_key,
                "label":      label,
                "group_name": group_name,
                "scale_type": mapping.get("scale_type"),
                "input_type": mapping.get("input_type"),
                "ll":         mapping.get("ll"),
                "ul":         mapping.get("ul"),
                "inverse":    mapping.get("inverse", False),
                "sort_order": (
                    SORT_ORDER.index(scale_key) if scale_key in SORT_ORDER else 99
                ),
            })

        # Add any scale keys defined in metadata but not yet used in objectives
        for scale_key, (label, group_name) in SCALE_META.items():
            if scale_key not in seen:
                catalogue.append({
                    "scale_key":  scale_key,
                    "label":      label,
                    "group_name": group_name,
                    "scale_type": None,
                    "input_type": None,
                    "ll":         None,
                    "ul":         None,
                    "inverse":    False,
                    "sort_order": SORT_ORDER.index(scale_key),
                })

        catalogue.sort(key=lambda x: x["sort_order"])
        return jsonify(catalogue)

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500