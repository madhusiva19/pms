"""
services/org_service.py

Business logic for organisational reference data:
countries, branches, sub-departments, designations, departments, users.
"""

from datetime import datetime

from models.supabase_client import supabase


# ── Countries ─────────────────────────────────────────────────────────────────

def get_all_countries() -> list:
    return supabase.table("countries").select("id, name, code").order("name").execute().data


# ── Branches ──────────────────────────────────────────────────────────────────

def get_all_branches() -> list:
    result = supabase.table("branches").select("id, code, name, country_id").order("name").execute()
    if result.data:
        return result.data
    # Fallback: derive unique branch IDs from departments
    depts      = supabase.table("departments").select("branch_id").execute().data
    unique_ids = list(set(d["branch_id"] for d in depts if d.get("branch_id")))
    return [{"id": bid, "name": bid, "code": bid, "country_id": None} for bid in unique_ids]


def create_branch(data: dict) -> dict:
    code = data.get("code", "").strip().upper()
    name = data.get("name", "").strip()
    if not code:
        raise ValueError("Branch code is required")
    if not name:
        raise ValueError("Branch name is required")
    if supabase.table("branches").select("id").eq("code", code).execute().data:
        raise LookupError(f"Branch '{code}' already exists.")
    result = supabase.table("branches").insert({
        "code":       code,
        "name":       name,
        "country_id": data.get("country_id") or None,
    }).execute()
    return result.data[0]


# ── Sub-departments ───────────────────────────────────────────────────────────

def get_sub_departments(department_id: str | None = None) -> list:
    query = supabase.table("sub_departments").select("id, name, code, department_id").order("name")
    if department_id:
        query = query.eq("department_id", department_id)
    return query.execute().data


# ── Designations ──────────────────────────────────────────────────────────────

def get_all_designations() -> list:
    return supabase.table("designations").select("*").order("name").execute().data


def create_designation(data: dict) -> dict:
    name = (data.get("name") or "").strip()
    if not name:
        raise ValueError("Designation name is required")
    if supabase.table("designations").select("id").ilike("name", name).execute().data:
        raise LookupError(f"Designation '{name}' already exists.")
    result = supabase.table("designations").insert({"name": name}).execute()
    return result.data[0]


# ── Departments ───────────────────────────────────────────────────────────────

def get_all_departments() -> list:
    return (
        supabase.table("departments")
        .select("id, name, code, branch_id, country_id")
        .order("name")
        .execute()
        .data
    )


def create_department(data: dict) -> dict:
    name      = (data.get("name") or "").strip()
    code      = (data.get("code") or "").strip().upper()
    branch_id = data.get("branch_id") or None
    if not name:
        raise ValueError("Department name is required")
    if not code:
        raise ValueError("Department code is required")
    if supabase.table("departments").select("id").eq("code", code).execute().data:
        raise LookupError(f"Department code '{code}' already exists.")
    now    = datetime.now().isoformat()
    result = supabase.table("departments").insert({
        "name":       name,
        "code":       code,
        "branch_id":  branch_id,
        "created_at": now,
        "updated_at": now,
    }).execute()
    return result.data[0]


# ── Users ─────────────────────────────────────────────────────────────────────

def get_all_users() -> list:
    all_users = (
        supabase.table("users")
        .select("id, full_name, department_id, branch_id, sub_department_id, country_id, designation_id")
        .order("full_name")
        .execute()
        .data
    )
    # Deduplicate by id (guards against data anomalies)
    seen, unique = set(), []
    for user in all_users:
        uid = str(user["id"])
        if uid not in seen:
            seen.add(uid)
            unique.append(user)
    return unique
