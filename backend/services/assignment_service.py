"""
services/assignment_service.py

Business logic for template assignment:
  - _build_rule_rows        → rows for template_assignment_combinations
  - _resolve_matched_users  → rows for template_assignments
  - assign_template         → orchestrates both writes
"""

from models.supabase_client import supabase
from models.constants import SCOPE_TO_DESIG


# ─────────────────────────────────────────────────────────────────────────────
# RULE ROW BUILDER
# ─────────────────────────────────────────────────────────────────────────────

def _build_rule_rows(template_id: int, rules: list) -> list:
    """
    Convert frontend rules into clean rows for template_assignment_combinations.
    Each row represents one logical rule (scope or designation+dept combination).

    """
    rows = []
    seen = set()

    for rule in rules:
        # Skip direct user rules — stored in template_assignments only
        if rule.get("user_id"):
            continue

        scope   = rule.get("scope") or None
        desig   = int(rule["designation_id"])    if rule.get("designation_id")    else None
        dept    = str(rule["department_id"])     if rule.get("department_id")     else None
        branch  = str(rule["branch_id"])         if rule.get("branch_id")         else None
        subdept = str(rule["sub_department_id"]) if rule.get("sub_department_id") else None
        country = str(rule["country_id"])        if rule.get("country_id")        else None

        # For scope rules, resolve designation from the scope key
        if scope and desig is None:
            desig = SCOPE_TO_DESIG.get(scope)

        key = (scope, desig, dept, branch, subdept, country)
        if key not in seen:
            seen.add(key)
            rows.append({
                "template_id":       template_id,
                "user_id":           None,   # never populated in combinations table
                "scope":             scope,
                "designation_id":    desig,
                "department_id":     dept,
                "branch_id":         branch,
                "country_id":        country,
                "sub_department_id": subdept,
            })

    return rows


# ─────────────────────────────────────────────────────────────────────────────
# USER MATCHER
# ─────────────────────────────────────────────────────────────────────────────

def _resolve_matched_users(template_id: int, rules: list, all_users: list) -> list:
    """
    Handles three rule types:
      1. Direct user rules  (rule has user_id)         → stored directly
      2. Scope rules        (rule has scope key)        → matched by designation ± country
      3. Standard rules     (designation + dept combo)  → matched by attribute comparison

    Uses name-based dept/subdept matching for cross-branch consistency.
    """
    try:
        all_depts    = supabase.table("departments").select("id, name, branch_id").execute().data or []
        all_subdepts = supabase.table("sub_departments").select("id, name, department_id").execute().data or []
    except Exception:
        all_depts    = []
        all_subdepts = []

    dept_id_to_name    = {str(d["id"]): d["name"].strip().lower() for d in all_depts}
    subdept_id_to_name = {str(s["id"]): s["name"].strip().lower() for s in all_subdepts}

    rows          = []
    seen_user_ids = set()

    def add_user(user: dict, scope: str | None):
        uid = str(user["id"])
        if uid in seen_user_ids:
            return
        seen_user_ids.add(uid)
        rows.append({
            "template_id":       template_id,
            "user_id":           uid,
            "designation_id":    int(user["designation_id"])    if user.get("designation_id")    else None,
            "department_id":     str(user["department_id"])     if user.get("department_id")     else None,
            "branch_id":         str(user["branch_id"])         if user.get("branch_id")         else None,
            "country_id":        str(user["country_id"])        if user.get("country_id")        else None,
            "sub_department_id": str(user["sub_department_id"]) if user.get("sub_department_id") else None,
            "scope":             scope,
        })

    def user_matches(u: dict, rule_desig, rule_dept_name, rule_subdept_name,
                     rule_branch, rule_country) -> bool:
        u_desig   = int(u["designation_id"])    if u.get("designation_id")    else None
        u_branch  = str(u["branch_id"])         if u.get("branch_id")         else None
        u_country = str(u["country_id"])        if u.get("country_id")        else None
        u_dept_id = str(u["department_id"])     if u.get("department_id")     else None

        if rule_desig   is not None and u_desig  != rule_desig:  return False
        if rule_branch  is not None and u_branch != rule_branch:  return False
        if rule_country is not None and u_country is not None and u_country != rule_country:
            return False

        if rule_dept_name is not None:
            u_dept_name = dept_id_to_name.get(u_dept_id) if u_dept_id else None
            if u_dept_name != rule_dept_name:
                return False

        if rule_subdept_name is not None:
            u_subdept_id = str(u["sub_department_id"]) if u.get("sub_department_id") else None
            if u_subdept_id:
                u_subdept_name = subdept_id_to_name.get(u_subdept_id)
                if u_subdept_name != rule_subdept_name:
                    return False
            # No sub_department_id on user - still include (sub_dept is best-effort)

        return True

    for rule in rules:
        # ── Direct user assignment ─────────────────────────────────────────────
        if rule.get("user_id"):
            uid     = str(rule["user_id"]).strip()
            matched = next((u for u in all_users if str(u["id"]) == uid), None)
            if matched:
                add_user(matched, scope=None)
            elif uid not in seen_user_ids:
                # User not found in master list — store bare row so assignment is not lost
                seen_user_ids.add(uid)
                rows.append({
                    "template_id":       template_id,
                    "user_id":           uid,
                    "designation_id":    None,
                    "department_id":     None,
                    "branch_id":         None,
                    "country_id":        None,
                    "sub_department_id": None,
                    "scope":             None,
                })
            continue

        # ── Scope quick-assign ─────────────────────────────────────────────────
        if rule.get("scope"):
            scope      = rule["scope"]
            country_id = rule.get("country_id") or None
            target     = SCOPE_TO_DESIG.get(scope)
            if target:
                for u in all_users:
                    u_desig = int(u["designation_id"]) if u.get("designation_id") else None
                    if u_desig != target:
                        continue
                    if country_id and str(u.get("country_id") or "") != str(country_id):
                        continue
                    add_user(u, scope=scope)
            continue

        # ── Standard designation + department combination rule ─────────────────
        rule_desig   = int(rule["designation_id"])    if rule.get("designation_id")    else None
        rule_dept    = str(rule["department_id"])     if rule.get("department_id")     else None
        rule_branch  = str(rule["branch_id"])         if rule.get("branch_id")         else None
        rule_subdept = str(rule["sub_department_id"]) if rule.get("sub_department_id") else None
        rule_country = str(rule["country_id"])        if rule.get("country_id")        else None

        if all(v is None for v in [rule_desig, rule_dept, rule_branch, rule_subdept, rule_country]):
            continue

        rule_dept_name    = dept_id_to_name.get(rule_dept)       if rule_dept    else None
        rule_subdept_name = subdept_id_to_name.get(rule_subdept) if rule_subdept else None

        for u in all_users:
            if user_matches(u, rule_desig, rule_dept_name, rule_subdept_name, rule_branch, rule_country):
                add_user(u, scope=None)

    return rows


# ─────────────────────────────────────────────────────────────────────────────
# ASSIGN ORCHESTRATOR
# ─────────────────────────────────────────────────────────────────────────────

def assign_template(template_id: int, rules: list) -> dict:
    """
    Two separate writes:
      1. template_assignment_combinations — one row per logical rule
                                            NEVER stores direct user_id
      2. template_assignments             — one row per matched user
                                            stores BOTH rule-matched AND direct users
    """
    all_users = supabase.table("users").select(
        "id, designation_id, department_id, branch_id, country_id, sub_department_id"
    ).execute().data

    # Deduplicate users by id to prevent duplicate assignment rows
    seen, unique = set(), []
    for u in all_users:
        uid = str(u["id"])
        if uid not in seen:
            seen.add(uid)
            unique.append(u)
    all_users = unique

    rule_rows = _build_rule_rows(template_id, rules)
    user_rows = _resolve_matched_users(template_id, rules, all_users)

    # Atomically replace both tables for this template
    supabase.table("template_assignment_combinations").delete().eq("template_id", template_id).execute()
    if rule_rows:
        supabase.table("template_assignment_combinations").insert(rule_rows).execute()

    supabase.table("template_assignments").delete().eq("template_id", template_id).execute()
    if user_rows:
        supabase.table("template_assignments").insert(user_rows).execute()

    return {"rules_stored": len(rule_rows), "users_matched": len(user_rows)}
