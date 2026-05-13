"""
services/template_service.py

Business logic for templates, template variants, and unfreeze exceptions.
Includes the full _enrich_templates() pipeline.
"""

from datetime import datetime
from datetime import timezone

from models.supabase_client import supabase
from models.constants import DEFAULT_MAX_SCORE
from services.freeze_service import get_active_pms_cycle, get_freeze_status


# ─────────────────────────────────────────────────────────────────────────────
# VARIANT HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def get_variants_for_template(template_id: int, pms_cycle_id: int | None = None) -> list:
    try:
        query = supabase.table("template_variants").select("*").eq("parent_template_id", template_id)
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
        query = supabase.table("template_unfreezes").select("*").eq("template_id", template_id)
        if pms_cycle_id:
            query = query.eq("pms_cycle_id", pms_cycle_id)
        return query.execute().data or []
    except Exception:
        return []


# ─────────────────────────────────────────────────────────────────────────────
# TEMPLATE ENRICHMENT
# ─────────────────────────────────────────────────────────────────────────────

def _enrich_templates(templates: list) -> list:
    # Load all assignment rules (logical rules, no user_ids)
    try:
        all_rules = supabase.table("template_assignment_combinations").select("*").execute().data or []
    except Exception:
        all_rules = []

    # Load all user assignments (user_id always populated)
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

    # Build lookup maps for name resolution
    desig_map   = {str(d["id"]): d["name"] for d in designations}
    dept_map    = {str(d["id"]): d for d in departments}
    subdept_map = {str(s["id"]): s for s in sub_departments}
    branch_map  = {str(b["id"]): b for b in branches}
    country_map = {str(c["id"]): c for c in countries}

    for template in templates:
        if "template_content" in template:
            template["categories"] = template.pop("template_content")

        t_id = template["id"]

        t_rules       = [r for r in all_rules           if r["template_id"] == t_id]
        t_user_rows   = [m for m in all_user_assignments if m["template_id"] == t_id]

        assigned_designation_ids = list(set(r["designation_id"]         for r in t_rules     if r.get("designation_id")))
        assigned_dept_ids        = list(set(str(r["department_id"])      for r in t_rules     if r.get("department_id")))
        assigned_branch_ids      = list(set(str(r["branch_id"])          for r in t_rules     if r.get("branch_id")))
        assigned_sub_dept_ids    = list(set(str(r["sub_department_id"])  for r in t_rules     if r.get("sub_department_id")))
        assigned_user_ids        = list(set(str(m["user_id"])            for m in t_user_rows if m.get("user_id")))
        assigned_country_ids     = list(set(str(r["country_id"])         for r in t_rules     if r.get("country_id")))
        for m in t_user_rows:
            if m.get("country_id"):
                cid = str(m["country_id"])
                if cid not in assigned_country_ids:
                    assigned_country_ids.append(cid)

        direct_user_ids_from_assignments = list(set(
            str(m["user_id"]) for m in t_user_rows
            if m.get("user_id") and not m.get("designation_id") and not m.get("department_id")
        ))

        template["assignedDesignations"]     = [desig_map.get(str(did), str(did)) for did in assigned_designation_ids]
        template["assignedDesignationIds"]   = assigned_designation_ids
        template["assignedDepartments"]      = [
            {"id": str(d["id"]), "name": d["name"], "code": d.get("code"),
             "branch_id": str(d["branch_id"]) if d.get("branch_id") else None}
            for d in departments if str(d["id"]) in assigned_dept_ids
        ]
        template["assignedDepartmentNames"]  = [dept_map[did]["name"] for did in assigned_dept_ids if did in dept_map]
        template["assignedDepartmentsIds"]   = assigned_dept_ids
        template["assignedBranches"]         = [
            {"id": str(b["id"]), "name": b["name"], "code": b.get("code"),
             "country_id": str(b["country_id"]) if b.get("country_id") else None}
            for b in branches if str(b["id"]) in assigned_branch_ids
        ]
        template["assignedBranchIds"]        = assigned_branch_ids
        template["assignedCountries"]        = [
            {"id": str(c["id"]), "name": c["name"], "code": c.get("code")}
            for c in countries if str(c["id"]) in assigned_country_ids
        ]
        template["assignedCountryIds"]       = assigned_country_ids
        template["assignedEmployees"]        = [u["full_name"] for u in users if str(u["id"]) in assigned_user_ids]
        template["assignedEmployeeIds"]      = assigned_user_ids
        template["assignedDirectUserIds"]    = direct_user_ids_from_assignments
        template["assignedSubDepartments"]   = [
            {"id": str(s["id"]), "name": s["name"], "code": s.get("code")}
            for s in sub_departments if str(s["id"]) in assigned_sub_dept_ids
        ]
        template["assignedSubDepartmentIds"] = assigned_sub_dept_ids

        template["assignedRules"] = [
            {
                "designation_id":      r.get("designation_id"),
                "designation_name":    desig_map.get(str(r["designation_id"]), "") if r.get("designation_id") else None,
                "department_id":       str(r["department_id"])     if r.get("department_id")     else None,
                "department_name":     dept_map.get(str(r["department_id"]), {}).get("name") if r.get("department_id") else None,
                "branch_id":           str(r["branch_id"])         if r.get("branch_id")         else None,
                "branch_name":         (lambda b: (b["code"] + " — " + b["name"]) if b else None)(branch_map.get(str(r["branch_id"]))) if r.get("branch_id") else None,
                "country_id":          str(r["country_id"])        if r.get("country_id")        else None,
                "country_name":        (lambda c: (c.get("code") or "") + " — " + c["name"])(country_map.get(str(r["country_id"]))) if r.get("country_id") else None,
                "sub_department_id":   str(r["sub_department_id"]) if r.get("sub_department_id") else None,
                "sub_department_name": subdept_map.get(str(r["sub_department_id"]), {}).get("name") if r.get("sub_department_id") else None,
                "user_id":             None,
                "scope":               r.get("scope"),
            }
            for r in t_rules
        ]
        for uid in direct_user_ids_from_assignments:
            template["assignedRules"].append({
                "designation_id":      None, "designation_name":    None,
                "department_id":       None, "department_name":     None,
                "branch_id":           None, "branch_name":         None,
                "country_id":          None, "country_name":        None,
                "sub_department_id":   None, "sub_department_name": None,
                "user_id":             uid,  "scope":               None,
            })

        if template.get("max_score") is None:
            template["max_score"] = DEFAULT_MAX_SCORE
        if "lastModified" not in template or template["lastModified"] is None:
            template["lastModified"] = template.get("lastmodified") or template.get("created_at")

        t_cycle_id = template.get("pms_cycle_id")
        is_past    = bool(t_cycle_id and active_cycle_id and int(t_cycle_id) != int(active_cycle_id))
        template["is_past_cycle"] = is_past
        template["freeze_status"] = "frozen" if is_past else active_freeze_status

        t_exceptions = [e for e in all_exceptions if e["template_id"] == t_id] if not is_past else []
        template["unfrozenBranchIds"]  = [str(e["branch_id"])  for e in t_exceptions if e.get("branch_id")]
        template["unfrozenCountryIds"] = [str(e["country_id"]) for e in t_exceptions if e.get("country_id")]
        template["unfreezeExceptions"] = [
            {
                "id":         e["id"],
                "branch_id":  str(e["branch_id"])  if e.get("branch_id")  else None,
                "country_id": str(e["country_id"]) if e.get("country_id") else None,
                "unfrozen_at": e.get("unfrozen_at"),
            }
            for e in t_exceptions
        ]

        t_variants = [v for v in all_variants if v["parent_template_id"] == t_id] if not is_past else []
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
    result   = supabase.table("templates").insert({
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
    for v in variants:
        if v.get("template_content"):
            v["categories"] = v.pop("template_content")
        if v.get("branch_id"):
            b = next((x for x in branches if str(x["id"]) == str(v["branch_id"])), None)
            v["branch_name"] = (b["code"] + " — " + b["name"]) if b else str(v["branch_id"])
        if v.get("country_id"):
            c = next((x for x in countries if str(x["id"]) == str(v["country_id"])), None)
            v["country_name"] = (c["code"] + " — " + c["name"]) if c else str(v["country_id"])
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
        "created_by":         "hq_admin",
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
    supabase.table("template_variants").delete().eq("id", variant_id).eq("parent_template_id", template_id).execute()


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
    return {"unfrozen": len(rows), "branch_ids": branch_ids, "country_ids": country_ids, "pms_cycle_id": cycle_id}


def bulk_delete_unfreeze_exceptions(template_id: int, exception_ids: list) -> int:
    if not exception_ids:
        raise ValueError("Provide exception_ids to re-freeze.")
    supabase.table("template_unfreezes").delete().in_("id", exception_ids).eq("template_id", template_id).execute()
    return len(exception_ids)


def delete_single_unfreeze_exception(template_id: int, exception_id: int) -> None:
    supabase.table("template_unfreezes").delete().eq("id", exception_id).eq("template_id", template_id).execute()


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

    for t in templates:
        if "template_content" in t:
            t["categories"] = t.pop("template_content")
        if t.get("max_score") is None:
            t["max_score"] = DEFAULT_MAX_SCORE

        variant = None
        if cycle_id and user_branch_id:
            variant = get_variant_for_branch(t["id"], user_branch_id, cycle_id)
        if not variant and cycle_id and user_country_id:
            variant = get_variant_for_country(t["id"], user_country_id, cycle_id)

        if variant:
            t["categories"]    = variant.get("template_content") or t.get("categories")
            t["description"]   = variant.get("description")      or t.get("description")
            t["max_score"]     = variant.get("max_score")        or t.get("max_score")
            t["total_weight"]  = variant.get("total_weight")     or t.get("total_weight")
            t["has_variant"]   = True
            t["variant_id"]    = variant["id"]
            t["variant_scope"] = "branch" if variant.get("branch_id") else "country"
        else:
            t["has_variant"]   = False
            t["variant_id"]    = None
            t["variant_scope"] = None

        result.append(t)
    return result
