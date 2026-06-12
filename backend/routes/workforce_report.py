from flask import Blueprint, jsonify, request
from utils.db import supabase
import math

workforce_report_bp = Blueprint("workforce_report", __name__)

PAGE_SIZE = 50


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


def name_map(table: str, ids: list) -> dict:
    if not ids:
        return {}
    rows = fetch_in(table, "id, name", "id", list(ids))
    return {r["id"]: r["name"] for r in rows}


def org_location(u: dict, country_names: dict, branch_names: dict,
                 dept_names: dict, subdept_names: dict) -> str:
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
        return f"{dept}, {branch}, {country}" if dept else "—"
    if role == "sub_dept_admin":
        return f"{subdept}, {dept}, {branch}, {country}" if country else f"{subdept}, {dept}, {branch}" if subdept else "—"
    parts = [p for p in [subdept, dept, branch, country] if p]
    return ", ".join(parts) if parts else "—"


def build_rows(users: list, pms_year: int,
               country_names: dict, branch_names: dict,
               dept_names: dict, subdept_names: dict,
               h1_score: dict, h2_score: dict,
               potential_by_user: dict) -> list:
    rows = []
    for u in users:
        uid       = u["id"]
        potential = potential_by_user.get(uid, {})
        rows.append({
            "id":                 uid,
            "emp_id":             u.get("emp_id"),
            "full_name":          u["full_name"],
            "role":               u["role"],
            "organisational_unit": org_location(u, country_names, branch_names, dept_names, subdept_names),
            "country":            country_names.get(u.get("country_id") or ""),
            "branch":             branch_names.get(u.get("branch_id") or ""),
            "department":         dept_names.get(u.get("department_id") or ""),
            "sub_department":     subdept_names.get(u.get("sub_department_id") or ""),
            "h1_score":           h1_score.get(uid),
            "h2_score":           h2_score.get(uid),
            "talent_block":       potential.get("talent_block"),
        })
    return rows


def sort_rows(rows: list) -> list:
    role_order = {"country_admin": 1, "branch_admin": 2,
                  "dept_admin": 3, "sub_dept_admin": 4, "employee": 5}
    rows.sort(key=lambda r: (
        r.get("country")        or "zzz",
        role_order.get(r["role"], 9),
        r.get("branch")         or "",
        r.get("department")     or "",
        r.get("sub_department") or "",
        r["full_name"],
    ))
    return rows


def get_latest_completed_year() -> int:
    """
    Returns the latest pms_year where BOTH H1 and H2 performance summaries exist.
    This is the last fully completed fiscal year.

    Example:
      Today = Jun 12 2026 → H2 2025/26 not yet calculated
      → returns 2025 (FY 2024/25 is fully complete)

      After Jul 16 2026 → H2 2025/26 calculated
      → returns 2026 (FY 2025/26 is fully complete)
    """
    try:
        # Get distinct years that have H1 data
        h1_res = supabase.table("performance_summaries")            .select("year")            .eq("period", "H1")            .execute()
        h1_years = {r["year"] for r in (h1_res.data or [])}

        # Get distinct years that have H2 data
        h2_res = supabase.table("performance_summaries")            .select("year")            .eq("period", "H2")            .execute()
        h2_years = {r["year"] for r in (h2_res.data or [])}

        # Years where BOTH H1 and H2 exist = fully completed fiscal years
        complete_years = h1_years & h2_years
        if complete_years:
            return max(complete_years)
        # No fully complete year yet — fall back to latest year with H2 data
        # (H2 is the closing half so it's more "complete" than H1-only)
        if h2_years:
            return max(h2_years)
        # Last resort — latest year with any data
        return max(h1_years | h2_years, default=2025)

    except Exception as exc:
        print(f"[ERROR] get_latest_completed_year: {exc}")
        return 2025


def fetch_users_for_role(requester_role: str, requester_country: str | None) -> list:
    """Fetch all users in two batches of 500 to avoid timeout."""
    results = []
    batch   = 500
    offset  = 0
    while True:
        q = (
            supabase.table("users")
            .select("id, full_name, role, emp_id, country_id, branch_id, department_id, sub_department_id")
            .neq("role", "hq_admin")
        )
        if requester_role == "country_admin":
            q = q.eq("country_id", requester_country)
        rows = q.range(offset, offset + batch - 1).execute().data or []
        results.extend(rows)
        if len(rows) < batch:
            break
        offset += batch
    return results


@workforce_report_bp.route("/api/workforce-report", methods=["GET"])
def get_workforce_report():
    try:
        requester_id = request.args.get("requester_id", "").strip()
        page         = max(1, request.args.get("page", 1, type=int))

        if not requester_id:
            return jsonify({"error": "requester_id required"}), 400

        # Auto-detect latest completed fiscal year (both H1 and H2 exist)
        pms_year = get_latest_completed_year()

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

        # Fetch all users
        all_users = fetch_users_for_role(requester_role, requester_country)
        total = len(all_users)

        if not all_users:
            return jsonify({"rows": [], "page": 1, "page_size": PAGE_SIZE,
                            "total": 0, "total_pages": 0, "requester_country": None})

        # Org name lookups — only unique IDs
        c_names = name_map("countries",       {u["country_id"]        for u in all_users if u.get("country_id")})
        b_names = name_map("branches",        {u["branch_id"]          for u in all_users if u.get("branch_id")})
        d_names = name_map("departments",     {u["department_id"]      for u in all_users if u.get("department_id")})
        s_names = name_map("sub_departments", {u["sub_department_id"]  for u in all_users if u.get("sub_department_id")})

        # Build + sort ALL rows first (needed for correct pagination)
        all_rows = build_rows(all_users, pms_year, c_names, b_names, d_names, s_names, {}, {}, {})
        all_rows = sort_rows(all_rows)

        # Paginate AFTER sort
        offset    = (page - 1) * PAGE_SIZE
        page_rows = all_rows[offset: offset + PAGE_SIZE]
        page_ids  = [r["id"] for r in page_rows]

        # Fetch scores only for this page's users
        h1_rows = fetch_in("performance_summaries", "user_id, total_score",
                           "user_id", page_ids, {"year": pms_year, "period": "H1"})
        h2_rows = fetch_in("performance_summaries", "user_id, total_score",
                           "user_id", page_ids, {"year": pms_year - 1, "period": "H2"})
        h1_score = {r["user_id"]: round(float(r["total_score"] or 0), 2) for r in h1_rows}
        h2_score = {r["user_id"]: round(float(r["total_score"] or 0), 2) for r in h2_rows}

        pot_rows = fetch_in("potential_assessments", "employee_id, talent_block",
                            "employee_id", page_ids, {"appraisal_cycle": pms_year})
        potential_by_user = {r["employee_id"]: r for r in pot_rows}

        # Enrich page rows with scores
        page_users = [u for u in all_users if u["id"] in set(page_ids)]
        page_users.sort(key=lambda u: page_ids.index(u["id"]))
        enriched = build_rows(page_users, pms_year, c_names, b_names, d_names, s_names,
                              h1_score, h2_score, potential_by_user)

        requester_country_name = c_names.get(requester_country or "") if requester_role == "country_admin" else None

        return jsonify({
            "rows":              enriched,
            "page":              page,
            "page_size":         PAGE_SIZE,
            "total":             total,
            "total_pages":       math.ceil(total / PAGE_SIZE),
            "requester_country": requester_country_name,
            "report_year":       pms_year,
        })

    except Exception as exc:
        print(f"[ERROR] get_workforce_report: {exc}")
        return jsonify({"error": str(exc)}), 500


@workforce_report_bp.route("/api/workforce-report/all", methods=["GET"])
def get_workforce_report_all():
    """Returns all rows in one call — used for PDF generation only."""
    try:
        requester_id = request.args.get("requester_id", "").strip()

        if not requester_id:
            return jsonify({"error": "requester_id required"}), 400

        # Auto-detect latest completed fiscal year (both H1 and H2 exist)
        pms_year = get_latest_completed_year()

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

        all_users = fetch_users_for_role(requester_role, requester_country)
        if not all_users:
            return jsonify({"rows": [], "requester_country": None})

        user_ids = [u["id"] for u in all_users]

        c_names = name_map("countries",       {u["country_id"]       for u in all_users if u.get("country_id")})
        b_names = name_map("branches",        {u["branch_id"]         for u in all_users if u.get("branch_id")})
        d_names = name_map("departments",     {u["department_id"]     for u in all_users if u.get("department_id")})
        s_names = name_map("sub_departments", {u["sub_department_id"] for u in all_users if u.get("sub_department_id")})

        h1_rows = fetch_in("performance_summaries", "user_id, total_score",
                           "user_id", user_ids, {"year": pms_year, "period": "H1"})
        h2_rows = fetch_in("performance_summaries", "user_id, total_score",
                           "user_id", user_ids, {"year": pms_year - 1, "period": "H2"})
        h1_score = {r["user_id"]: round(float(r["total_score"] or 0), 2) for r in h1_rows}
        h2_score = {r["user_id"]: round(float(r["total_score"] or 0), 2) for r in h2_rows}

        pot_rows = fetch_in("potential_assessments", "employee_id, talent_block",
                            "employee_id", user_ids, {"appraisal_cycle": pms_year})
        potential_by_user = {r["employee_id"]: r for r in pot_rows}

        rows = build_rows(all_users, pms_year, c_names, b_names, d_names, s_names,
                          h1_score, h2_score, potential_by_user)
        rows = sort_rows(rows)

        requester_country_name = c_names.get(requester_country or "") if requester_role == "country_admin" else None

        return jsonify({"rows": rows, "requester_country": requester_country_name, "report_year": pms_year})

    except Exception as exc:
        print(f"[ERROR] get_workforce_report_all: {exc}")
        return jsonify({"error": str(exc)}), 500