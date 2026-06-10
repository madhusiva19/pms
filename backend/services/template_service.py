"""
services/template_service.py

Business logic for templates, template variants, and unfreeze exceptions.
Includes the full _enrich_templates() pipeline.

Responsibilities:
    - CRUD operations for templates and template variants
    - Enriching templates with assignment rules, user data, and cycle metadata
    - Managing unfreeze exceptions for frozen templates
    - Serving user-facing "my templates" with variant resolution
    - NEW: get_all_variants_across_templates() — HQ Admin global variant view
"""

from datetime import datetime, timezone

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
    """
    Fetch all variants for a given template, optionally filtered by PMS cycle.
    """
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
    """
    Fetch a single template variant scoped to a specific branch.
    """
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
    """
    Fetch a single template variant scoped to a specific country.
    """
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
    """
    Fetch unfreeze exceptions for a template, optionally scoped to a PMS cycle.
    """
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
    """
    Build dictionary lookup maps from flat lists for O(1) name resolution.
    """
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
    """
    Extract unique assigned entity IDs from assignment rules and user rows.
    """
    designation_ids  = list(set(r["designation_id"]         for r in t_rules     if r.get("designation_id")))
    dept_ids         = list(set(str(r["department_id"])      for r in t_rules     if r.get("department_id")))
    branch_ids       = list(set(str(r["branch_id"])          for r in t_rules     if r.get("branch_id")))
    sub_dept_ids     = list(set(str(r["sub_department_id"])  for r in t_rules     if r.get("sub_department_id")))
    user_ids         = list(set(str(m["user_id"])            for m in t_user_rows if m.get("user_id")))

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

def _build_assigned_rules(t_rules: list, direct_user_ids: list,
                          desig_map, dept_map, subdept_map, branch_map, country_map) -> list:
    """
    Build the enriched assignedRules list combining logical rules and direct user entries.
    """
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
            "designation_id":      None, "designation_name":    None,
            "department_id":       None, "department_name":     None,
            "branch_id":           None, "branch_name":         None,
            "country_id":          None, "country_name":        None,
            "sub_department_id":   None, "sub_department_name": None,
            "user_id":             uid,  "scope":               None,
        })

    return rules


# ─────────────────────────────────────────────────────────────────────────────
# TEMPLATE ENRICHMENT
# ─────────────────────────────────────────────────────────────────────────────

def _enrich_templates(templates: list) -> list:
    """
    Enrich a list of raw template records with:
        - Resolved assignment names (designations, departments, branches, etc.)
        - Direct and rule-based user assignments
        - Freeze status and unfreeze exceptions
        - Template variants for the active PMS cycle
        - Fallback defaults for max_score and lastModified
    """
    # ── Load assignment data ──────────────────────────────────────────────────
    try:
        all_rules = supabase.table("template_assignment_combinations").select("*").execute().data or []
    except Exception:
        all_rules = []

    try:
        all_user_assignments = supabase.table("template_assignments").select("*").execute().data or []
    except Exception:
        all_user_assignments = []

    # ── Load reference data ───────────────────────────────────────────────────
    designations    = supabase.table("designations").select("*").execute().data
    departments     = supabase.table("departments").select("*").execute().data
    sub_departments = supabase.table("sub_departments").select("id, name, code, department_id").execute().data
    branches        = supabase.table("branches").select("id, code, name, country_id").execute().data
    countries       = supabase.table("countries").select("id, name, code").execute().data
    users           = supabase.table("users").select("id, full_name").execute().data

    # ── Cycle and freeze state ────────────────────────────────────────────────
    active_cycle         = get_active_pms_cycle()
    active_cycle_id      = active_cycle["id"] if active_cycle else None
    active_freeze_status = get_freeze_status()

    # ── Unfreeze exceptions for active cycle ──────────────────────────────────
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

    # ── Variants for active cycle ─────────────────────────────────────────────
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

    # ── Build lookup maps ─────────────────────────────────────────────────────
    desig_map, dept_map, subdept_map, branch_map, country_map = _build_lookup_maps(
        designations, departments, sub_departments, branches, countries
    )

    # ── Enrich each template ──────────────────────────────────────────────────
    for template in templates:
        if "template_content" in template:
            template["categories"] = template.pop("template_content")

        t_id        = template["id"]
        t_rules     = [r for r in all_rules           if r["template_id"] == t_id]
        t_user_rows = [m for m in all_user_assignments if m["template_id"] == t_id]

        ids = _collect_assigned_ids(t_rules, t_user_rows)

        # ── Resolved name lists ───────────────────────────────────────────────
        template["assignedDesignations"]     = [desig_map.get(str(did), str(did)) for did in ids["designation_ids"]]
        template["assignedDesignationIds"]   = ids["designation_ids"]

        template["assignedDepartments"]      = [
            {
                "id":        str(d["id"]),
                "name":      d["name"],
                "code":      d.get("code"),
                "branch_id": str(d["branch_id"]) if d.get("branch_id") else None,
            }
            for d in departments if str(d["id"]) in ids["dept_ids"]
        ]
        template["assignedDepartmentNames"]  = [dept_map[did]["name"] for did in ids["dept_ids"] if did in dept_map]
        template["assignedDepartmentsIds"]   = ids["dept_ids"]

        template["assignedBranches"]         = [
            {
                "id":         str(b["id"]),
                "name":       b["name"],
                "code":       b.get("code"),
                "country_id": str(b["country_id"]) if b.get("country_id") else None,
            }
            for b in branches if str(b["id"]) in ids["branch_ids"]
        ]
        template["assignedBranchIds"]        = ids["branch_ids"]

        template["assignedCountries"]        = [
            {"id": str(c["id"]), "name": c["name"], "code": c.get("code")}
            for c in countries if str(c["id"]) in ids["country_ids"]
        ]
        template["assignedCountryIds"]       = ids["country_ids"]

        template["assignedEmployees"]        = [u["full_name"] for u in users if str(u["id"]) in ids["user_ids"]]
        template["assignedEmployeeIds"]      = ids["user_ids"]
        template["assignedDirectUserIds"]    = ids["direct_user_ids"]

        template["assignedSubDepartments"]   = [
            {"id": str(s["id"]), "name": s["name"], "code": s.get("code")}
            for s in sub_departments if str(s["id"]) in ids["sub_dept_ids"]
        ]
        template["assignedSubDepartmentIds"] = ids["sub_dept_ids"]

        template["assignedRules"] = _build_assigned_rules(
            t_rules, ids["direct_user_ids"],
            desig_map, dept_map, subdept_map, branch_map, country_map,
        )

        if template.get("max_score") is None:
            template["max_score"] = DEFAULT_MAX_SCORE

        if not template.get("lastModified"):
            template["lastModified"] = (
                template.get("lastmodified") or template.get("created_at")
            )

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
    """
    Fetch all templates ordered by lastModified descending, then enrich them.
    """
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
    """
    Fetch and enrich a single template by ID.
    """
    result = supabase.table("templates").select("*").eq("id", template_id).single().execute()
    if not result.data:
        raise LookupError("Template not found")
    return _enrich_templates([result.data])[0]


def create_template(data: dict) -> dict:
    """
    Insert a new template into the active PMS cycle.
    """
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
    """
    Update mutable fields of an existing template.
    """
    now     = datetime.now().isoformat()
    payload = {"lastModified": now}

    if data.get("name")        is not None: payload["name"]             = data["name"]
    if data.get("description") is not None: payload["description"]      = data["description"]
    if data.get("max_score")   is not None: payload["max_score"]        = data["max_score"]
    if data.get("categories")  is not None: payload["template_content"] = data["categories"]
    if data.get("totalWeight") is not None: payload["total_weight"]     = data["totalWeight"]

    supabase.table("templates").update(payload).eq("id", template_id).execute()



def delete_template(template_id: int) -> None:
    """
    Delete a template and all its associated assignment records.
    """
    supabase.table("template_assignment_combinations").delete().eq("template_id", template_id).execute()
    supabase.table("template_assignments").delete().eq("template_id", template_id).execute()
    supabase.table("templates").delete().eq("id", template_id).execute()


def get_cycle_template_count(cycle_id: int) -> int:
    """
    Returns how many templates exist for a given PMS cycle.
    """
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
    Called once when a new PMS cycle is created and has no templates yet.
    Returns { "copied": <int>, "template_ids": [...] }
    """
    # Guard: don't double-duplicate
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
        .execute()
        .data or []
    )

    now = datetime.now(timezone.utc).isoformat()
    new_ids = []

    for t in source_templates:
        result = supabase.table("templates").insert({
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
        }).execute()
        if result.data:
            new_ids.append(result.data[0]["id"])

    return {"copied": len(new_ids), "template_ids": new_ids}



# ─────────────────────────────────────────────────────────────────────────────
# VARIANT CRUD
# ─────────────────────────────────────────────────────────────────────────────

def list_template_variants(template_id: int) -> list:
    """
    List all variants for a template in the active PMS cycle, with resolved names.
    """
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
    """
    Create a new branch- or country-scoped variant of a template.
    """
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
    """
    Fetch a single variant by ID, verified to belong to the given template.
    """
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
    """
    Update an existing template variant's mutable fields.
    """
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
    """
    Delete a single variant, scoped to the given parent template.
    """
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
    """
    Create unfreeze exceptions for one or more branches and/or countries.
    Existing exceptions for the same scope are replaced (delete-then-insert).
    """
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
    """
    Re-freeze a set of branches/countries by deleting their unfreeze exceptions.
    """
    if not exception_ids:
        raise ValueError("Provide exception_ids to re-freeze.")

    supabase.table("template_unfreezes").delete().in_("id", exception_ids).eq("template_id", template_id).execute()
    return len(exception_ids)


def delete_single_unfreeze_exception(template_id: int, exception_id: int) -> None:
    """
    Delete a single unfreeze exception record.
    """
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
    """
    Return the templates assigned to a specific user, overlaid with any
    branch- or country-scoped variant relevant to that user.

    Variant resolution order:
        1. Branch-level variant (most specific)
        2. Country-level variant
        3. Base template (fallback)
    """
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
            template["categories"]   = variant.get("template_content") or template.get("categories")
            template["description"]  = variant.get("description")      or template.get("description")
            template["max_score"]    = variant.get("max_score")        or template.get("max_score")
            template["total_weight"] = variant.get("total_weight")     or template.get("total_weight")
            template["has_variant"]  = True
            template["variant_id"]   = variant["id"]
            template["variant_scope"] = SCOPE_BRANCH if variant.get("branch_id") else SCOPE_COUNTRY
        else:
            template["has_variant"]   = False
            template["variant_id"]    = None
            template["variant_scope"] = None

        result.append(template)

    return result


# ─────────────────────────────────────────────────────────────────────────────
# ALL VARIANTS — HQ Admin global view  (NEW)
# ─────────────────────────────────────────────────────────────────────────────

def get_all_variants_across_templates(filters: dict | None = None) -> list:
    """
    Fetch every template variant across ALL templates and ALL PMS cycles
    for the HQ Admin global variants dashboard.

    Enriches each variant with:
        - Parent template name, freeze status, and cycle metadata
        - Resolved branch_name / country_name
        - categories alias for template_content
        - is_past_cycle flag

    Optional filters dict keys (all lists of strings):
        branch_ids, country_ids, pms_cycle_ids, template_ids

    Returns list of enriched variant dicts, sorted by lastModified desc.
    """
    filters = filters or {}

    # ── Fetch all variants ────────────────────────────────────────────────────
    try:
        query = supabase.table("template_variants").select("*")

        if filters.get("template_ids"):
            query = query.in_("parent_template_id", filters["template_ids"])
        if filters.get("pms_cycle_ids"):
            query = query.in_("pms_cycle_id", filters["pms_cycle_ids"])
        if filters.get("branch_ids"):
            query = query.in_("branch_id", filters["branch_ids"])
        if filters.get("country_ids"):
            query = query.in_("country_id", filters["country_ids"])

        all_variants = query.order("lastModified", desc=True).execute().data or []
    except Exception:
        all_variants = []

    if not all_variants:
        return []

    # ── Fetch reference data ──────────────────────────────────────────────────
    try:
        all_templates_raw = supabase.table("templates").select(
            "id, name, pms_cycle_id, freeze_status"
        ).execute().data or []
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

    # ── Build lookup maps ─────────────────────────────────────────────────────
    template_map = {str(t["id"]): t for t in all_templates_raw}
    branch_map   = {str(b["id"]): b for b in branches}
    country_map  = {str(c["id"]): c for c in countries}
    cycle_map    = {str(c["id"]): c for c in all_cycles}

    # Active cycle ID to compute is_past_cycle
    active_cycle    = get_active_pms_cycle()
    active_cycle_id = active_cycle["id"] if active_cycle else None
    active_freeze   = get_freeze_status()

    # ── Enrich each variant ───────────────────────────────────────────────────
    enriched = []
    for v in all_variants:
        # Normalise content field
        if "template_content" in v:
            v["categories"] = v.pop("template_content")
        if v.get("max_score") is None:
            v["max_score"] = DEFAULT_MAX_SCORE

        # Parent template info
        parent = template_map.get(str(v.get("parent_template_id")))
        v["parent_template_name"] = parent["name"] if parent else "Unknown"

        # Cycle info
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

        # is_past_cycle
        is_past = bool(v_cycle_id and active_cycle_id and int(v_cycle_id) != int(active_cycle_id))
        v["is_past_cycle"] = is_past
        v["freeze_status"] = FREEZE_STATUS_FROZEN if is_past else active_freeze

        # Branch / country name resolution
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

        # Ensure lastModified has a fallback
        if not v.get("lastModified"):
            v["lastModified"] = v.get("created_at")

        enriched.append(v)

    # Sort newest-first
    enriched.sort(
        key=lambda x: x.get("lastModified") or x.get("created_at") or "",
        reverse=True,
    )

    return enriched

