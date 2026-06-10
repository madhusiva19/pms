from flask import Blueprint, jsonify, request
from utils.db import supabase
import math

workforce_report_bp = Blueprint("workforce_report", __name__)

PAGE_SIZE = 50


def fetch_all(table: str, select: str, filters: dict = {}) -> list:
    """Fetch all rows from a table using offset pagination to avoid URL limits."""
    results = []
    offset  = 0
    batch   = 1000
    while True:
        q = supabase.table(table).select(select)
        for k, v in filters.items():
            q = q.eq(k, v)
        rows = q.range(offset, offset + batch - 1).execute().data or []
        results.extend(rows)
        if len(rows) < batch:
            break
        offset += batch
    return results


def fetch_in(table: str, select: str, column: str, ids: list, extra: dict = {}) -> list:
    """Fetch rows matching a list of IDs, chunked to avoid URL limits."""
    if not ids:
        return []
    results = []
    for i in range(0, len(ids), 50):
        chunk = ids[i:i + 50]
        q = supabase.table(table).select(select).in_(column, chunk)
        for k, v in extra.items():
            q = q.eq(k, v)
        results.extend(q.execute().data or [])
    return results


@workforce_report_bp.route("/api/workforce-report", methods=["GET"])
def get_workforce_report():
    """
    Annual Workforce Performance & Potential Report — paginated.

    HQ Admin      -> all users across all countries
    Country Admin -> only users under their country_id

    Query params:
      pms_year     (int) e.g. 2025
      requester_id (str) UUID of logged-in user
      page         (int) 1-indexed (default 1)
    """
    try:
        pms_year     = request.args.get("pms_year", type=int)
        requester_id = request.args.get("requester_id", "").strip()
        page         = max(1, request.args.get("page", 1, type=int))

        if not pms_year or not requester_id:
            return jsonify({"error": "pms_year and requester_id required"}), 400

        req_res = (
            supabase.table("users")
            .select("role, country_id")
            .eq("id", requester_id)
            .single()
            .execute()
        )
        if not req_res.data:
            return jsonify({"error": "Requester not found"}), 404

        requester_role    = req_res.data["role"]
        requester_country = req_res.data.get("country_id")

        if requester_role not in ("hq_admin", "country_admin"):
            return jsonify({"error": "Access denied"}), 403

        # Fetch all users using offset pagination
        filters = {"role": None}  # placeholder — we filter below
        all_users_raw = fetch_all(
            "users",
            "id, full_name, role, emp_id, country_id, branch_id, department_id, sub_department_id",
        )

        # Filter out hq_admin and scope to country if needed
        all_users = [
            u for u in all_users_raw
            if u.get("role") != "hq_admin"
            and (requester_role == "hq_admin" or u.get("country_id") == requester_country)
        ]

        total = len(all_users)
        if not all_users:
            return jsonify({"rows": [], "page": 1, "page_size": PAGE_SIZE, "total": 0, "total_pages": 0})

        user_ids = [u["id"] for u in all_users]

        # Fetch org names
        country_ids = list({u["country_id"]       for u in all_users if u.get("country_id")})
        branch_ids  = list({u["branch_id"]         for u in all_users if u.get("branch_id")})
        dept_ids    = list({u["department_id"]     for u in all_users if u.get("department_id")})
        subdept_ids = list({u["sub_department_id"] for u in all_users if u.get("sub_department_id")})

        def name_map(table: str, ids: list) -> dict:
            rows = fetch_in(table, "id, name", "id", ids)
            return {r["id"]: r["name"] for r in rows}

        country_names = name_map("countries",       country_ids)
        branch_names  = name_map("branches",        branch_ids)
        dept_names    = name_map("departments",     dept_ids)
        subdept_names = name_map("sub_departments", subdept_ids)
        print(f"[DEBUG] country_names: {country_names}")
        print(f"[DEBUG] country_ids: {country_ids[:3]}")

        # Fetch performance summaries
        perf_rows = fetch_in(
            "performance_summaries", "user_id, period, total_score",
            "user_id", user_ids, {"year": pms_year}
        )
        h1_score: dict = {}
        h2_score: dict = {}
        for row in perf_rows:
            uid   = row["user_id"]
            score = round(float(row["total_score"] or 0), 2)
            if row["period"] == "H1":
                h1_score[uid] = score
            else:
                h2_score[uid] = score

        # Fetch potential assessments
        pot_rows = fetch_in(
            "potential_assessments",
            "employee_id, talent_block, overall_ability, overall_aspiration, overall_leadership",
            "employee_id", user_ids, {"appraisal_cycle": pms_year}
        )
        potential_by_user = {r["employee_id"]: r for r in pot_rows}

        # Build org location string
        def org_location(u: dict) -> str:
            country = country_names.get(u.get("country_id") or "")
            branch  = branch_names.get(u.get("branch_id") or "")
            dept    = dept_names.get(u.get("department_id") or "")
            subdept = subdept_names.get(u.get("sub_department_id") or "")
            role    = u.get("role", "")
            if role == "country_admin":
                return country or "—"
            if role == "branch_admin":
                return f"{branch}, {country}" if branch and country else (branch or country or "—")
            if role == "dept_admin":
                return f"{dept} — {branch}, {country}" if dept else "—"
            if role == "sub_dept_admin":
                return f"{subdept} — {dept}, {branch}" if subdept else "—"
            parts = [p for p in [subdept or dept, branch, country] if p]
            return " — ".join(parts) if parts else "—"

        # Assemble all rows
        rows = []
        for u in all_users:
            uid       = u["id"]
            potential = potential_by_user.get(uid, {})
            rows.append({
                "id":                 uid,
                "emp_id":             u.get("emp_id"),
                "full_name":          u["full_name"],
                "role":               u["role"],
                "org_location":       org_location(u),
                "country":            country_names.get(u.get("country_id") or ""),
                "branch":             branch_names.get(u.get("branch_id") or ""),
                "department":         dept_names.get(u.get("department_id") or ""),
                "sub_department":     subdept_names.get(u.get("sub_department_id") or ""),
                "h1_score":           h1_score.get(uid),
                "h2_score":           h2_score.get(uid),
                "talent_block":       potential.get("talent_block"),
                "overall_ability":    potential.get("overall_ability"),
                "overall_aspiration": potential.get("overall_aspiration"),
                "overall_leadership": potential.get("overall_leadership"),
            })

        # Sort: country name → role priority → branch → dept → sub-dept → name
        # Role is sorted BEFORE branch/dept so admins always appear before
        # their subordinates within the same country group
        role_order = {"country_admin": 1, "branch_admin": 2, "dept_admin": 3, "sub_dept_admin": 4, "employee": 5}
        rows.sort(key=lambda r: (
            r.get("country")        or "zzz",
            role_order.get(r["role"], 9),
            r.get("branch")         or "",
            r.get("department")     or "",
            r.get("sub_department") or "",
            r["full_name"],
        ))

        # Paginate after sorting
        offset    = (page - 1) * PAGE_SIZE
        paginated = rows[offset: offset + PAGE_SIZE]

        return jsonify({
            "rows":        paginated,
            "page":        page,
            "page_size":   PAGE_SIZE,
            "total":       total,
            "total_pages": math.ceil(total / PAGE_SIZE),
        })

    except Exception as exc:
        print(f"[ERROR] get_workforce_report: {exc}")
        return jsonify({"error": str(exc)}), 500