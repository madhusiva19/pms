"""
services/template_service.py

Business logic for templates, template variants, and unfreeze exceptions.
Includes the full _enrich_templates() pipeline.

Responsibilities:
    - CRUD operations for templates and template variants
    - Enriching templates with assignment rules, user data, and cycle metadata
    - Managing unfreeze exceptions for frozen templates
    - Serving user-facing "my templates" with variant resolution
    - copy_assignments_for_rolled_over_templates() — copies assignments to new cycle
    - get_all_variants_across_templates() — HQ Admin global variant view
"""

from datetime import datetime, timezone, timedelta

from models.constants import DEFAULT_MAX_SCORE
from models.supabase_client import supabase
from services.freeze_service import get_active_pms_cycle, get_freeze_status


# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

FREEZE_STATUS_FROZEN = "frozen"
SCOPE_BRANCH         = "branch"
SCOPE_COUNTRY        = "country"
CREATED_BY_DEFAULT   = "hq_admin"


# ─────────────────────────────────────────────────────────────────────────────
# VARIANT HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def get_variants_for_template(template_id: int, pms_cycle_id: int | None = None) -> list:
    try:
        query = (
            supabase.table("template_variants")
            .select("*")
            .eq("parent_template_id", template_id)
        )
        if pms_cycle_id:
            query = query.eq("pms_cycle_id", pms_cycle_id)
        return query.execute().data or []
    except Exception:
        return []


def get_variant_for_branch(template_id: int, branch_id: str, pms_cycle_id: int) -> dict | None:
    try:
        result = (
            supabase.table("template_variants")
            .select("*")
            .eq("parent_template_id", template_id)
            .eq("branch_id", branch_id)
            .eq("pms_cycle_id", pms_cycle_id)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None
    except Exception:
        return None


def get_variant_for_country(template_id: int, country_id: str, pms_cycle_id: int) -> dict | None:
    try:
        result = (
            supabase.table("template_variants")
            .select("*")
            .eq("parent_template_id", template_id)
            .eq("country_id", country_id)
            .eq("pms_cycle_id", pms_cycle_id)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# UNFREEZE EXCEPTION HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def get_unfreeze_exceptions(template_id: int, pms_cycle_id: int | None = None) -> list:
    try:
        query = (
            supabase.table("template_unfreezes")
            .select("*")
            .eq("template_id", template_id)
        )
        if pms_cycle_id:
            query = query.eq("pms_cycle_id", pms_cycle_id)
        return query.execute().data or []
    except Exception:
        return []


# ─────────────────────────────────────────────────────────────────────────────
# INTERNAL: LOOKUP MAP BUILDERS
# ─────────────────────────────────────────────────────────────────────────────

def _build_lookup_maps(designations, departments, sub_departments, branches, countries):
    desig_map   = {str(d["id"]): d["name"] for d in designations}
    dept_map    = {str(d["id"]): d         for d in departments}
    subdept_map = {str(s["id"]): s         for s in sub_departments}
    branch_map  = {str(b["id"]): b         for b in branches}
    country_map = {str(c["id"]): c         for c in countries}
    return desig_map, dept_map, subdept_map, branch_map, country_map


# ─────────────────────────────────────────────────────────────────────────────
# INTERNAL: ASSIGNMENT AGGREGATORS
# ─────────────────────────────────────────────────────────────────────────────

def _collect_assigned_ids(t_rules: list, t_user_rows: list) -> dict:
    designation_ids = list(set(r["designation_id"]        for r in t_rules     if r.get("designation_id")))
    dept_ids        = list(set(str(r["department_id"])     for r in t_rules     if r.get("department_id")))
    branch_ids      = list(set(str(r["branch_id"])         for r in t_rules     if r.get("branch_id")))
    sub_dept_ids    = list(set(str(r["sub_department_id"]) for r in t_rules     if r.get("sub_department_id")))
    user_ids        = list(set(str(m["user_id"])           for m in t_user_rows if m.get("user_id")))

    country_ids = list(set(str(r["country_id"]) for r in t_rules if r.get("country_id")))
    for row in t_user_rows:
        cid = str(row["country_id"]) if row.get("country_id") else None
        if cid and cid not in country_ids:
            country_ids.append(cid)

    direct_user_ids = list(set(
        str(m["user_id"]) for m in t_user_rows
        if m.get("user_id") and not m.get("designation_id") and not m.get("department_id")
    ))

    return {
        "designation_ids": designation_ids,
        "dept_ids":        dept_ids,
        "branch_ids":      branch_ids,
        "sub_dept_ids":    sub_dept_ids,
        "user_ids":        user_ids,
        "country_ids":     country_ids,
        "direct_user_ids": direct_user_ids,
    }


# ─────────────────────────────────────────────────────────────────────────────
# INTERNAL: ASSIGNED RULES BUILDER
# ─────────────────────────────────────────────────────────────────────────────

def _build_assigned_rules(t_rules, direct_user_ids, desig_map, dept_map, subdept_map, branch_map, country_map):
    def _branch_label(branch_id):
        b = branch_map.get(str(branch_id))
        return (b["code"] + " — " + b["name"]) if b else None

    def _country_label(country_id):
        c = country_map.get(str(country_id))
        return ((c.get("code") or "") + " — " + c["name"]) if c else None

    rules = [
        {
            "designation_id":      r.get("designation_id"),
            "designation_name":    desig_map.get(str(r["designation_id"]), "") if r.get("designation_id") else None,
            "department_id":       str(r["department_id"])     if r.get("department_id")     else None,
            "department_name":     dept_map.get(str(r["department_id"]), {}).get("name")      if r.get("department_id")     else None,
            "branch_id":           str(r["branch_id"])         if r.get("branch_id")         else None,
            "branch_name":         _branch_label(r["branch_id"])                              if r.get("branch_id")         else None,
            "country_id":          str(r["country_id"])        if r.get("country_id")        else None,
            "country_name":        _country_label(r["country_id"])                            if r.get("country_id")        else None,
            "sub_department_id":   str(r["sub_department_id"]) if r.get("sub_department_id") else None,
            "sub_department_name": subdept_map.get(str(r["sub_department_id"]), {}).get("name") if r.get("sub_department_id") else None,
            "user_id":             None,
            "scope":               r.get("scope"),
        }
        for r in t_rules
    ]

    for uid in direct_user_ids:
        rules.append({
            "designation_id": None, "designation_name": None,
            "department_id":  None, "department_name":  None,
            "branch_id":      None, "branch_name":      None,
            "country_id":     None, "country_name":     None,
            "sub_department_id": None, "sub_department_name": None,
            "user_id": uid, "scope": None,
        })

    return rules


# ─────────────────────────────────────────────────────────────────────────────
# TEMPLATE ENRICHMENT
# ─────────────────────────────────────────────────────────────────────────────

def _enrich_templates(templates: list) -> list:
    try:
        all_rules = supabase.table("template_assignment_combinations").select("*").execute().data or []
    except Exception:
        all_rules = []

    try:
        all_user_assignments = supabase.table("template_assignments").select("*").execute().data or []
    except Exception:
        all_user_assignments = []

    designations    = supabase.table("designations").select("*").execute().data
    departments     = supabase.table("departments").select("*").execute().data
    sub_departments = supabase.table("sub_departments").select("id, name, code, department_id").execute().data
    branches        = supabase.table("branches").select("id, code, name, country_id").execute().data
    countries       = supabase.table("countries").select("id, name, code").execute().data
    users           = supabase.table("users").select("id, full_name").execute().data

    active_cycle         = get_active_pms_cycle()
    active_cycle_id      = active_cycle["id"] if active_cycle else None
    active_freeze_status = get_freeze_status()

    try:
        all_exceptions = (
            supabase.table("template_unfreezes")
            .select("*")
            .eq("pms_cycle_id", active_cycle_id)
            .execute()
            .data or []
        ) if active_cycle_id else []
    except Exception:
        all_exceptions = []

    try:
        all_variants = (
            supabase.table("template_variants")
            .select("id, parent_template_id, branch_id, country_id, name, lastModified")
            .eq("pms_cycle_id", active_cycle_id)
            .execute()
            .data or []
        ) if active_cycle_id else []
    except Exception:
        all_variants = []

    desig_map, dept_map, subdept_map, branch_map, country_map = _build_lookup_maps(
        designations, departments, sub_departments, branches, countries
    )

    for template in templates:
        if "template_content" in template:
            template["categories"] = template.pop("template_content")

        t_id        = template["id"]
        t_rules     = [r for r in all_rules           if r["template_id"] == t_id]
        t_user_rows = [m for m in all_user_assignments if m["template_id"] == t_id]

        ids = _collect_assigned_ids(t_rules, t_user_rows)

        template["assignedDesignations"]     = [desig_map.get(str(did), str(did)) for did in ids["designation_ids"]]
        template["assignedDesignationIds"]   = ids["designation_ids"]
        template["assignedDepartments"]      = [{"id": str(d["id"]), "name": d["name"], "code": d.get("code"), "branch_id": str(d["branch_id"]) if d.get("branch_id") else None} for d in departments if str(d["id"]) in ids["dept_ids"]]
        template["assignedDepartmentNames"]  = [dept_map[did]["name"] for did in ids["dept_ids"] if did in dept_map]
        template["assignedDepartmentsIds"]   = ids["dept_ids"]
        template["assignedBranches"]         = [{"id": str(b["id"]), "name": b["name"], "code": b.get("code"), "country_id": str(b["country_id"]) if b.get("country_id") else None} for b in branches if str(b["id"]) in ids["branch_ids"]]
        template["assignedBranchIds"]        = ids["branch_ids"]
        template["assignedCountries"]        = [{"id": str(c["id"]), "name": c["name"], "code": c.get("code")} for c in countries if str(c["id"]) in ids["country_ids"]]
        template["assignedCountryIds"]       = ids["country_ids"]
        template["assignedEmployees"]        = [u["full_name"] for u in users if str(u["id"]) in ids["user_ids"]]
        template["assignedEmployeeIds"]      = ids["user_ids"]
        template["assignedDirectUserIds"]    = ids["direct_user_ids"]
        template["assignedSubDepartments"]   = [{"id": str(s["id"]), "name": s["name"], "code": s.get("code")} for s in sub_departments if str(s["id"]) in ids["sub_dept_ids"]]
        template["assignedSubDepartmentIds"] = ids["sub_dept_ids"]
        template["assignedRules"]            = _build_assigned_rules(
            t_rules, ids["direct_user_ids"],
            desig_map, dept_map, subdept_map, branch_map, country_map,
        )

        if template.get("max_score") is None:
            template["max_score"] = DEFAULT_MAX_SCORE

        if not template.get("lastModified"):
            template["lastModified"] = template.get("lastmodified") or template.get("created_at")

        t_cycle_id = template.get("pms_cycle_id")
        is_past    = bool(t_cycle_id and active_cycle_id and int(t_cycle_id) != int(active_cycle_id))

        template["is_past_cycle"] = is_past
        template["freeze_status"] = FREEZE_STATUS_FROZEN if is_past else active_freeze_status

        t_exceptions = [e for e in all_exceptions if e["template_id"] == t_id] if not is_past else []
        t_variants   = [v for v in all_variants   if v["parent_template_id"] == t_id] if not is_past else []

        template["unfrozenBranchIds"]  = [str(e["branch_id"])  for e in t_exceptions if e.get("branch_id")]
        template["unfrozenCountryIds"] = [str(e["country_id"]) for e in t_exceptions if e.get("country_id")]
        template["unfreezeExceptions"] = [
            {
                "id":          e["id"],
                "branch_id":   str(e["branch_id"])  if e.get("branch_id")  else None,
                "country_id":  str(e["country_id"]) if e.get("country_id") else None,
                "unfrozen_at": e.get("unfrozen_at"),
            }
            for e in t_exceptions
        ]
        template["variants"] = [
            {
                "id":           v["id"],
                "branch_id":    str(v["branch_id"])  if v.get("branch_id")  else None,
                "country_id":   str(v["country_id"]) if v.get("country_id") else None,
                "name":         v.get("name"),
                "lastModified": v.get("lastModified"),
            }
            for v in t_variants
        ]
        template["hasVariants"] = len(t_variants) > 0

    return templates


# ─────────────────────────────────────────────────────────────────────────────
# TEMPLATE CRUD
# ─────────────────────────────────────────────────────────────────────────────

def get_all_templates() -> list:
    try:
        templates = (
            supabase.table("templates")
            .select("*")
            .order("lastModified", desc=True)
            .execute()
            .data
        )
    except Exception:
        templates = supabase.table("templates").select("*").execute().data
        templates.sort(
            key=lambda t: t.get("lastModified") or t.get("lastmodified") or t.get("created_at") or "",
            reverse=True,
        )
    return _enrich_templates(templates)


def get_single_template(template_id: int) -> dict:
    result = supabase.table("templates").select("*").eq("id", template_id).single().execute()
    if not result.data:
        raise LookupError("Template not found")
    return _enrich_templates([result.data])[0]


def create_template(data: dict) -> dict:
    now      = datetime.now().isoformat()
    cycle    = get_active_pms_cycle()
    cycle_id = cycle["id"] if cycle else None

    result = supabase.table("templates").insert({
        "name":             data.get("name"),
        "description":      data.get("description"),
        "max_score":        data.get("max_score", DEFAULT_MAX_SCORE),
        "template_content": data.get("categories"),
        "total_weight":     data.get("totalWeight"),
        "pms_cycle_id":     cycle_id,
        "status":           "active",
        "created_at":       now,
        "lastModified":     now,
        "created_by":       None,
    }).execute()

    return result.data[0]


def update_template(template_id: int, data: dict) -> None:
    now     = datetime.now().isoformat()
    payload = {"lastModified": now}

    if data.get("name")        is not None: payload["name"]             = data["name"]
    if data.get("description") is not None: payload["description"]      = data["description"]
    if data.get("max_score")   is not None: payload["max_score"]        = data["max_score"]
    if data.get("categories")  is not None: payload["template_content"] = data["categories"]
    if data.get("totalWeight") is not None: payload["total_weight"]     = data["totalWeight"]

    supabase.table("templates").update(payload).eq("id", template_id).execute()


def delete_template(template_id: int) -> None:
    supabase.table("template_assignment_combinations").delete().eq("template_id", template_id).execute()
    supabase.table("template_assignments").delete().eq("template_id", template_id).execute()
    supabase.table("templates").delete().eq("id", template_id).execute()


def get_cycle_template_count(cycle_id: int) -> int:
    rows = (
        supabase.table("templates")
        .select("id")
        .eq("pms_cycle_id", cycle_id)
        .execute()
        .data or []
    )
    return len(rows)


def rollover_cycle(old_cycle_id: int, new_cycle_id: int) -> dict:
    """
    Duplicate all templates from old_cycle_id into new_cycle_id.
    Idempotent — skips if new cycle already has templates.
    Never copies id — lets DB auto-generate.

    Each template gets a unique timestamp (1 second apart) so sort
    order is deterministic after rollover.
    """
    existing = (
        supabase.table("templates")
        .select("id")
        .eq("pms_cycle_id", new_cycle_id)
        .execute()
        .data or []
    )
    if existing:
        return {"copied": 0, "template_ids": [], "skipped": True}

    source_templates = (
        supabase.table("templates")
        .select("*")
        .eq("pms_cycle_id", old_cycle_id)
        .order("lastModified", desc=True)
        .execute()
        .data or []
    )

    base_time = datetime.now(timezone.utc)
    new_ids   = []

    for i, t in enumerate(source_templates):
        # Each template gets a 1-second offset so newest-first order is preserved
        now = (base_time + timedelta(seconds=i)).isoformat()
        payload = {
            "name":             t.get("name"),
            "description":      t.get("description"),
            "template_content": t.get("template_content"),
            "max_score":        t.get("max_score", DEFAULT_MAX_SCORE),
            "total_weight":     t.get("total_weight"),
            "pms_cycle_id":     new_cycle_id,
            "status":           "active",
            "created_at":       now,
            "lastModified":     now,
            "created_by":       None,
        }
        result = supabase.table("templates").insert(payload).execute()
        if result.data:
            new_ids.append(result.data[0]["id"])

    return {"copied": len(new_ids), "template_ids": new_ids}

# ─────────────────────────────────────────────────────────────────────────────
# POPULATE RELATIONAL TABLES FROM TEMPLATE CONTENT JSON
# ─────────────────────────────────────────────────────────────────────────────

def populate_relational_tables_from_content(new_cycle_id: int) -> dict:
    """
    After a cycle rollover, the new templates only have template_content (JSON).
    This function populates the relational categories and objectives tables
    from that JSON so all downstream endpoints work correctly.
    Idempotent — skips templates that already have categories rows.
    """
    new_templates = (
        supabase.table("templates")
        .select("id, name, template_content")
        .eq("pms_cycle_id", new_cycle_id)
        .execute()
        .data or []
    )

    populated = 0
    skipped   = 0

    for tmpl in new_templates:
        template_id      = tmpl["id"]
        template_content = tmpl.get("template_content")

        if not template_content:
            skipped += 1
            continue

        # Check if categories already exist for this template — idempotent
        existing = (
            supabase.table("categories")
            .select("id")
            .eq("template_id", template_id)
            .limit(1)
            .execute()
            .data or []
        )
        if existing:
            skipped += 1
            continue

        # Insert categories and objectives from template_content JSON
        for cat in template_content:
            cat_name   = cat.get("name", "")
            cat_weight = cat.get("weight", 0)

            cat_res = (
                supabase.table("categories")
                .insert({
                    "template_id": template_id,
                    "name":        cat_name,
                    "weight":      cat_weight,
                    "type":        "Weighted",
                })
                .execute()
            )
            if not cat_res.data:
                continue

            cat_id = cat_res.data[0]["id"]

            obj_rows = []
            for obj in cat.get("objectives", []):
                obj_rows.append({
                    "category_id":  cat_id,
                    "name":         obj.get("name", ""),
                    "weight":       obj.get("weight", 0),
                    "max_score":    obj.get("kpiMaxScore") or 5,
                    "control_type": obj.get("control", "Locked"),
                    "kpi_scale":    obj.get("kpiScale", ""),
                })

            if obj_rows:
                supabase.table("objectives").insert(obj_rows).execute()

        populated += 1

    print(f"✅ populate_relational_tables: populated {populated} templates, skipped {skipped} for cycle {new_cycle_id}")
    return {"populated": populated, "skipped": skipped}
# ─────────────────────────────────────────────────────────────────────────────
# COPY ASSIGNMENTS FOR ROLLED OVER TEMPLATES
# ─────────────────────────────────────────────────────────────────────────────

def copy_assignments_for_rolled_over_templates(
    old_cycle_id: int,
    new_cycle_id: int,
) -> dict:
    """
    Copy assignment rules and user assignments from old cycle templates
    into the matching new cycle templates.

    Copies both tables:
      template_assignment_combinations → designation/dept/branch/scope rules
      template_assignments             → matched user rows

    Matching:
      Old template ↔ New template matched by NAME (case-insensitive)

    Idempotent:
      If new cycle templates already have assignments → skips entirely

    Returns:
      { copied_rules, copied_users, skipped }
    """
    # ── Fetch old and new templates ───────────────────────────────────────────
    old_templates = (
        supabase.table("templates")
        .select("id, name")
        .eq("pms_cycle_id", old_cycle_id)
        .execute()
        .data or []
    )
    new_templates = (
        supabase.table("templates")
        .select("id, name")
        .eq("pms_cycle_id", new_cycle_id)
        .execute()
        .data or []
    )

    if not old_templates or not new_templates:
        return {"copied_rules": 0, "copied_users": 0, "skipped": False}

    # ── Idempotent guard ──────────────────────────────────────────────────────
    new_template_ids = [str(t["id"]) for t in new_templates]
    existing = (
        supabase.table("template_assignment_combinations")
        .select("id")
        .in_("template_id", new_template_ids)
        .limit(1)
        .execute()
        .data or []
    )
    if existing:
        print(f"⚠️  copy_assignments: cycle {new_cycle_id} templates already have assignments — skipping.")
        return {"copied_rules": 0, "copied_users": 0, "skipped": True}

    # ── Build name → new_id map ───────────────────────────────────────────────
    new_name_map = {t["name"].strip().lower(): t["id"] for t in new_templates}

    # ── Build old_id → new_id map by name ────────────────────────────────────
    id_map: dict[int, int] = {}
    for old_t in old_templates:
        name_key = old_t["name"].strip().lower()
        if name_key in new_name_map:
            id_map[old_t["id"]] = new_name_map[name_key]

    if not id_map:
        print(f"⚠️  copy_assignments: no matching names between cycle {old_cycle_id} and {new_cycle_id}.")
        return {"copied_rules": 0, "copied_users": 0, "skipped": False}

    old_ids_str = [str(i) for i in id_map.keys()]

    # ── Fetch old rules and user rows ─────────────────────────────────────────
    old_rules     = (
        supabase.table("template_assignment_combinations")
        .select("*")
        .in_("template_id", old_ids_str)
        .execute()
        .data or []
    )
    old_user_rows = (
        supabase.table("template_assignments")
        .select("*")
        .in_("template_id", old_ids_str)
        .execute()
        .data or []
    )

    copied_rules = 0
    copied_users = 0

    # ── Copy combination rules ────────────────────────────────────────────────
    if old_rules:
        new_rules_payload = []
        for rule in old_rules:
            old_tid = rule.get("template_id")
            new_tid = id_map.get(int(old_tid)) if old_tid else None
            if not new_tid:
                continue
            new_rule = {k: v for k, v in rule.items() if k != "id"}
            new_rule["template_id"] = new_tid
            new_rules_payload.append(new_rule)

        if new_rules_payload:
            supabase.table("template_assignment_combinations").insert(new_rules_payload).execute()
            copied_rules = len(new_rules_payload)

            # Bump lastModified on all new-cycle templates so they sort correctly
            now_iso = datetime.now(timezone.utc).isoformat()
            for new_tid in id_map.values():
                supabase.table("templates").update(
                    {"lastModified": now_iso}
                ).eq("id", new_tid).execute()

    # ── Copy user assignment rows ─────────────────────────────────────────────
    if old_user_rows:
        new_users_payload = []
        for row in old_user_rows:
            old_tid = row.get("template_id")
            new_tid = id_map.get(int(old_tid)) if old_tid else None
            if not new_tid:
                continue
            new_row = {k: v for k, v in row.items() if k != "id"}
            new_row["template_id"] = new_tid
            new_users_payload.append(new_row)

        if new_users_payload:
            supabase.table("template_assignments").insert(new_users_payload).execute()
            copied_users = len(new_users_payload)

    print(
        f"✅  copy_assignments: copied {copied_rules} rules and "
        f"{copied_users} user rows from cycle {old_cycle_id} to {new_cycle_id}."
    )

    return {"copied_rules": copied_rules, "copied_users": copied_users, "skipped": False}


# ─────────────────────────────────────────────────────────────────────────────
# VARIANT CRUD
# ─────────────────────────────────────────────────────────────────────────────

def list_template_variants(template_id: int) -> list:
    active = get_active_pms_cycle()
    if not active:
        return []

    variants  = get_variants_for_template(template_id, active["id"])
    branches  = supabase.table("branches").select("id, name, code").execute().data
    countries = supabase.table("countries").select("id, name, code").execute().data

    for variant in variants:
        if variant.get("template_content"):
            variant["categories"] = variant.pop("template_content")
        if variant.get("branch_id"):
            branch = next((b for b in branches if str(b["id"]) == str(variant["branch_id"])), None)
            variant["branch_name"] = (branch["code"] + " — " + branch["name"]) if branch else str(variant["branch_id"])
        if variant.get("country_id"):
            country = next((c for c in countries if str(c["id"]) == str(variant["country_id"])), None)
            variant["country_name"] = (country["code"] + " — " + country["name"]) if country else str(variant["country_id"])

    return variants


def create_template_variant(template_id: int, data: dict) -> dict:
    active = get_active_pms_cycle()
    if not active:
        raise ValueError("No active PMS cycle.")

    branch_id  = data.get("branch_id")  or None
    country_id = data.get("country_id") or None

    if not branch_id and not country_id:
        raise ValueError("Provide branch_id or country_id for the variant scope.")

    exceptions = get_unfreeze_exceptions(template_id, active["id"])

    if branch_id and not any(str(e.get("branch_id")) == str(branch_id) for e in exceptions):
        raise PermissionError("This branch is not unfrozen. Unfreeze it first before creating a variant.")
    if country_id and not any(str(e.get("country_id")) == str(country_id) for e in exceptions):
        raise PermissionError("This country is not unfrozen. Unfreeze it first before creating a variant.")

    if branch_id:
        existing = get_variant_for_branch(template_id, str(branch_id), active["id"])
        if existing:
            raise FileExistsError(f"A variant already exists for this branch.|{existing['id']}")
    if country_id:
        existing = get_variant_for_country(template_id, str(country_id), active["id"])
        if existing:
            raise FileExistsError(f"A variant already exists for this country.|{existing['id']}")

    main = supabase.table("templates").select("*").eq("id", template_id).single().execute().data
    if not main:
        raise LookupError("Parent template not found.")

    now    = datetime.now(timezone.utc).isoformat()
    result = supabase.table("template_variants").insert({
        "parent_template_id": template_id,
        "branch_id":          str(branch_id)  if branch_id  else None,
        "country_id":         str(country_id) if country_id else None,
        "pms_cycle_id":       active["id"],
        "template_content":   main.get("template_content"),
        "name":               main.get("name"),
        "description":        main.get("description"),
        "max_score":          main.get("max_score", DEFAULT_MAX_SCORE),
        "total_weight":       main.get("total_weight"),
        "created_by":         CREATED_BY_DEFAULT,
        "created_at":         now,
        "lastModified":       now,
    }).execute()

    variant = result.data[0]
    if variant.get("template_content"):
        variant["categories"] = variant.pop("template_content")

    return variant


def get_template_variant(template_id: int, variant_id: int) -> dict:
    result = (
        supabase.table("template_variants")
        .select("*")
        .eq("id", variant_id)
        .eq("parent_template_id", template_id)
        .single()
        .execute()
    )
    if not result.data:
        raise LookupError("Variant not found.")

    variant = result.data
    if variant.get("template_content"):
        variant["categories"] = variant.pop("template_content")
    if variant.get("max_score") is None:
        variant["max_score"] = DEFAULT_MAX_SCORE

    return variant


def update_template_variant(template_id: int, variant_id: int, data: dict) -> None:
    active = get_active_pms_cycle()
    if not active:
        raise ValueError("No active PMS cycle.")

    v_result = (
        supabase.table("template_variants")
        .select("*")
        .eq("id", variant_id)
        .eq("parent_template_id", template_id)
        .single()
        .execute()
    )
    if not v_result.data:
        raise LookupError("Variant not found.")

    variant = v_result.data

    if int(variant["pms_cycle_id"]) != int(active["id"]):
        raise PermissionError("This variant belongs to a past cycle and is permanently frozen.")

    exceptions = get_unfreeze_exceptions(template_id, active["id"])

    if variant.get("branch_id") and not any(str(e.get("branch_id")) == str(variant["branch_id"]) for e in exceptions):
        raise PermissionError("This branch has been re-frozen. Cannot edit variant.")
    if variant.get("country_id") and not any(str(e.get("country_id")) == str(variant["country_id"]) for e in exceptions):
        raise PermissionError("This country has been re-frozen. Cannot edit variant.")

    now     = datetime.now().isoformat()
    payload = {"lastModified": now}

    if data.get("name")        is not None: payload["name"]             = data["name"]
    if data.get("description") is not None: payload["description"]      = data["description"]
    if data.get("max_score")   is not None: payload["max_score"]        = data["max_score"]
    if data.get("categories")  is not None: payload["template_content"] = data["categories"]
    if data.get("totalWeight") is not None: payload["total_weight"]     = data["totalWeight"]

    supabase.table("template_variants").update(payload).eq("id", variant_id).execute()


def delete_template_variant(template_id: int, variant_id: int) -> None:
    (
        supabase.table("template_variants")
        .delete()
        .eq("id", variant_id)
        .eq("parent_template_id", template_id)
        .execute()
    )


# ─────────────────────────────────────────────────────────────────────────────
# UNFREEZE EXCEPTION CRUD
# ─────────────────────────────────────────────────────────────────────────────

def create_unfreeze_exceptions(template_id: int, data: dict) -> dict:
    active = get_active_pms_cycle()
    if not active:
        raise LookupError("No active PMS cycle found.")

    cycle_id    = active["id"]
    branch_ids  = data.get("branch_ids")  or []
    country_ids = data.get("country_ids") or []

    if not branch_ids and not country_ids:
        raise ValueError("Provide at least one branch_id or country_id.")

    now  = datetime.now(timezone.utc).isoformat()
    rows = []

    for bid in branch_ids:
        supabase.table("template_unfreezes").delete().eq("template_id", template_id).eq("branch_id", str(bid)).eq("pms_cycle_id", cycle_id).execute()
        rows.append({"template_id": template_id, "branch_id": str(bid), "country_id": None, "pms_cycle_id": cycle_id, "unfrozen_at": now})

    for cid in country_ids:
        supabase.table("template_unfreezes").delete().eq("template_id", template_id).eq("country_id", str(cid)).eq("pms_cycle_id", cycle_id).execute()
        rows.append({"template_id": template_id, "branch_id": None, "country_id": str(cid), "pms_cycle_id": cycle_id, "unfrozen_at": now})

    if rows:
        supabase.table("template_unfreezes").insert(rows).execute()

    return {
        "unfrozen":    len(rows),
        "branch_ids":  branch_ids,
        "country_ids": country_ids,
        "pms_cycle_id": cycle_id,
    }


def bulk_delete_unfreeze_exceptions(template_id: int, exception_ids: list) -> int:
    if not exception_ids:
        raise ValueError("Provide exception_ids to re-freeze.")
    supabase.table("template_unfreezes").delete().in_("id", exception_ids).eq("template_id", template_id).execute()
    return len(exception_ids)


def delete_single_unfreeze_exception(template_id: int, exception_id: int) -> None:
    (
        supabase.table("template_unfreezes")
        .delete()
        .eq("id", exception_id)
        .eq("template_id", template_id)
        .execute()
    )


# ─────────────────────────────────────────────────────────────────────────────
# MY-TEMPLATES (user-facing)
# ─────────────────────────────────────────────────────────────────────────────

def get_my_templates(user_id: str) -> list:
    assignments  = supabase.table("template_assignments").select("template_id").eq("user_id", user_id).execute().data
    template_ids = list(set(a["template_id"] for a in assignments))
    if not template_ids:
        return []

    user_data       = supabase.table("users").select("branch_id, country_id").eq("id", user_id).single().execute().data
    user_branch_id  = str(user_data["branch_id"])  if user_data and user_data.get("branch_id")  else None
    user_country_id = str(user_data["country_id"]) if user_data and user_data.get("country_id") else None

    active   = get_active_pms_cycle()
    cycle_id = active["id"] if active else None

    templates = supabase.table("templates").select("*").in_("id", template_ids).execute().data
    result    = []

    for template in templates:
        if "template_content" in template:
            template["categories"] = template.pop("template_content")
        if template.get("max_score") is None:
            template["max_score"] = DEFAULT_MAX_SCORE

        variant = None
        if cycle_id and user_branch_id:
            variant = get_variant_for_branch(template["id"], user_branch_id, cycle_id)
        if not variant and cycle_id and user_country_id:
            variant = get_variant_for_country(template["id"], user_country_id, cycle_id)

        if variant:
            template["categories"]    = variant.get("template_content") or template.get("categories")
            template["description"]   = variant.get("description")      or template.get("description")
            template["max_score"]     = variant.get("max_score")        or template.get("max_score")
            template["total_weight"]  = variant.get("total_weight")     or template.get("total_weight")
            template["has_variant"]   = True
            template["variant_id"]    = variant["id"]
            template["variant_scope"] = SCOPE_BRANCH if variant.get("branch_id") else SCOPE_COUNTRY
        else:
            template["has_variant"]   = False
            template["variant_id"]    = None
            template["variant_scope"] = None

        result.append(template)

    return result


# ─────────────────────────────────────────────────────────────────────────────
# ALL VARIANTS — HQ Admin global view
# ─────────────────────────────────────────────────────────────────────────────

def get_all_variants_across_templates(filters: dict | None = None) -> list:
    filters = filters or {}

    try:
        query = supabase.table("template_variants").select("*")
        if filters.get("template_ids"):  query = query.in_("parent_template_id", filters["template_ids"])
        if filters.get("pms_cycle_ids"): query = query.in_("pms_cycle_id",        filters["pms_cycle_ids"])
        if filters.get("branch_ids"):    query = query.in_("branch_id",            filters["branch_ids"])
        if filters.get("country_ids"):   query = query.in_("country_id",           filters["country_ids"])
        all_variants = query.order("lastModified", desc=True).execute().data or []
    except Exception:
        all_variants = []

    if not all_variants:
        return []

    try:
        all_templates_raw = supabase.table("templates").select("id, name, pms_cycle_id, freeze_status").execute().data or []
    except Exception:
        all_templates_raw = []

    try:
        all_cycles = supabase.table("pms_cycles").select("id, pms_year, pms_start").execute().data or []
    except Exception:
        all_cycles = []

    try:
        branches  = supabase.table("branches").select("id, name, code, country_id").execute().data or []
    except Exception:
        branches = []

    try:
        countries = supabase.table("countries").select("id, name, code").execute().data or []
    except Exception:
        countries = []

    template_map    = {str(t["id"]): t for t in all_templates_raw}
    branch_map      = {str(b["id"]): b for b in branches}
    country_map     = {str(c["id"]): c for c in countries}
    cycle_map       = {str(c["id"]): c for c in all_cycles}
    active_cycle    = get_active_pms_cycle()
    active_cycle_id = active_cycle["id"] if active_cycle else None
    active_freeze   = get_freeze_status()

    enriched = []
    for v in all_variants:
        if "template_content" in v:
            v["categories"] = v.pop("template_content")
        if v.get("max_score") is None:
            v["max_score"] = DEFAULT_MAX_SCORE

        parent = template_map.get(str(v.get("parent_template_id")))
        v["parent_template_name"] = parent["name"] if parent else "Unknown"

        v_cycle_id = v.get("pms_cycle_id")
        cycle_rec  = cycle_map.get(str(v_cycle_id)) if v_cycle_id else None

        if cycle_rec:
            pms_year = cycle_rec.get("pms_year")
            if not pms_year and cycle_rec.get("pms_start"):
                y = int(str(cycle_rec["pms_start"])[:4])
                pms_year = f"{y}/{y + 1}"
            v["pms_year"] = pms_year
        else:
            v["pms_year"] = None

        is_past            = bool(v_cycle_id and active_cycle_id and int(v_cycle_id) != int(active_cycle_id))
        v["is_past_cycle"] = is_past
        v["freeze_status"] = FREEZE_STATUS_FROZEN if is_past else active_freeze

        if v.get("branch_id"):
            b = branch_map.get(str(v["branch_id"]))
            v["branch_name"] = ((b["code"] + " — " + b["name"]) if b else str(v["branch_id"]))
        else:
            v["branch_name"] = None

        if v.get("country_id"):
            c = country_map.get(str(v["country_id"]))
            v["country_name"] = (((c.get("code") or "") + " — " + c["name"]) if c else str(v["country_id"]))
        else:
            v["country_name"] = None

        if not v.get("lastModified"):
            v["lastModified"] = v.get("created_at")

        enriched.append(v)

    enriched.sort(
        key=lambda x: x.get("lastModified") or x.get("created_at") or "",
        reverse=True,
    )

    return enriched