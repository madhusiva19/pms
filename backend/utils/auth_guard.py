import requests as req
from models import supabase, SUPABASE_URL, SUPABASE_KEY


def require_auth(request):
    """Verifies the Authorization: Bearer <token> header against Supabase
    and returns the caller's auth user id, or None if missing/invalid."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None

    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        return None

    try:
        res = req.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "apikey":        SUPABASE_KEY,
                "Authorization": f"Bearer {token}",
            }
        )
    except Exception:
        return None

    if res.status_code != 200:
        return None

    return res.json().get("id")


def is_authorized_for(caller_id, target_id):
    """True if caller_id can view target_id's data: themselves, or someone
    in their reporting chain (matching org scope at a lower org_level)."""
    if not caller_id or not target_id:
        return False

    if caller_id == target_id:
        return True

    caller_res = supabase.table("users")\
        .select("org_level, country_id, branch_id, department_id, sub_department_id")\
        .eq("id", caller_id)\
        .execute()
    target_res = supabase.table("users")\
        .select("org_level, country_id, branch_id, department_id, sub_department_id, manager_id")\
        .eq("id", target_id)\
        .execute()

    if not caller_res.data or not target_res.data:
        return False

    caller = caller_res.data[0]
    target = target_res.data[0]

    caller_level = caller.get("org_level")
    target_level = target.get("org_level")

    if caller_level is None or target_level is None or caller_level >= target_level:
        return False

    if caller_level == 1:
        return True
    if caller_level == 2:
        return target.get("country_id") == caller.get("country_id")
    if caller_level == 3:
        return target.get("branch_id") == caller.get("branch_id")
    if caller_level == 4:
        return target.get("department_id") == caller.get("department_id")
    if caller_level == 5:
        return (
            target.get("manager_id") == caller_id
            or target.get("sub_department_id") == caller.get("sub_department_id")
        )

    return False


def is_authorized_for_org_entity(caller_id, entity_type, entity_id):
    """True if caller_id may view dashboard drilldown data for the org unit
    identified by (entity_type, entity_id): HQ (level 1) sees everything,
    lower levels only see entities within their own scope."""
    if not caller_id or not entity_type or not entity_id:
        return False

    caller_res = supabase.table("users")\
        .select("org_level, country_id, branch_id, department_id, sub_department_id")\
        .eq("id", caller_id)\
        .execute()
    if not caller_res.data:
        return False

    caller = caller_res.data[0]
    caller_level = caller.get("org_level")
    if caller_level is None:
        return False
    if caller_level == 1:
        return True

    # entity_type is the scope being drilled INTO, e.g. entity_type="country"
    # means entity_id is the country whose branches/departments are listed.
    if entity_type == "country":
        return caller_level == 2 and caller.get("country_id") == entity_id

    if entity_type == "branch":
        branch_res = supabase.table("branches").select("country_id").eq("id", entity_id).execute()
        if not branch_res.data:
            return False
        branch = branch_res.data[0]
        if caller_level == 2:
            return caller.get("country_id") == branch.get("country_id")
        if caller_level == 3:
            return caller.get("branch_id") == entity_id
        return False

    if entity_type == "department":
        dept_res = supabase.table("departments").select("branch_id").eq("id", entity_id).execute()
        if not dept_res.data:
            return False
        branch_id = dept_res.data[0].get("branch_id")

        if caller_level == 3:
            return caller.get("branch_id") == branch_id

        if caller_level == 2:
            branch_res = supabase.table("branches").select("country_id").eq("id", branch_id).execute()
            if not branch_res.data:
                return False
            return caller.get("country_id") == branch_res.data[0].get("country_id")

        if caller_level == 4:
            return caller.get("department_id") == entity_id

        return False

    if entity_type == "sub_department":
        subdept_res = supabase.table("sub_departments").select("department_id").eq("id", entity_id).execute()
        if not subdept_res.data:
            return False
        dept_id = subdept_res.data[0].get("department_id")

        if caller_level == 5:
            return caller.get("sub_department_id") == entity_id

        if caller_level == 4:
            return caller.get("department_id") == dept_id

        if caller_level in (2, 3):
            dept_res = supabase.table("departments").select("branch_id").eq("id", dept_id).execute()
            if not dept_res.data:
                return False
            branch_id = dept_res.data[0].get("branch_id")

            if caller_level == 3:
                return caller.get("branch_id") == branch_id

            branch_res = supabase.table("branches").select("country_id").eq("id", branch_id).execute()
            if not branch_res.data:
                return False
            return caller.get("country_id") == branch_res.data[0].get("country_id")

        return False

    return False