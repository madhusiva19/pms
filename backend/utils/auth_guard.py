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
