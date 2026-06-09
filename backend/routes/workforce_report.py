from flask import Blueprint, jsonify, request
from supabase_client import supabase

workforce_report_bp = Blueprint("workforce_report", __name__)


@workforce_report_bp.route("/api/workforce-report", methods=["GET"])
def get_workforce_report():
    """
    Annual Workforce Performance & Potential Report.

    Returns all users with their:
    - Name, role, org location (country/branch/dept/sub-dept)
    - Total performance score for the given pms_year
    - Potential assessment talent_block for the given appraisal_cycle year

    Access:
      hq_admin    -> all users across all countries
      country_admin -> only users under their country_id

    Query params:
      pms_year    (int)  e.g. 2025
      requester_id (str) UUID of logged-in user
    """
    try:
        pms_year     = request.args.get("pms_year", type=int)
        requester_id = request.args.get("requester_id", "").strip()

        if not pms_year or not requester_id:
            return jsonify({"error": "pms_year and requester_id required"}), 400

        # Get requester role and country
        req_res = (
            supabase.table("users")
            .select("role, country_id")
            .eq("id", requester_id)
            .single()
            .execute()
        )
        if not req_res.data:
            return jsonify({"error": "Requester not found"}), 404

        requester     = req_res.data
        requester_role = requester["role"]
        requester_country = requester.get("country_id")

        if requester_role not in ("hq_admin", "country_admin"):
            return jsonify({"error": "Access denied"}), 403

        # Fetch all users with org names joined
        users_q = (
            supabase.table("users")
            .select(
                "id, full_name, role, emp_id, "
                "country_id, branch_id, department_id, sub_department_id, "
                "countries!users_country_id_fkey(name), "
                "branches!users_branch_id_fkey(name), "
                "departments!users_department_id_fkey(name), "
                "sub_departments!users_sub_department_id_fkey(name)"
            )
            .eq("is_active", True)
            .neq("role", "hq_admin")
        )

        # Country Admin scoped to their country only
        if requester_role == "country_admin":
            users_q = users_q.eq("country_id", requester_country)

        users_res = users_q.execute()
        users = users_res.data or []

        if not users:
            return jsonify([])

        user_ids = [u["id"] for u in users]

        # Fetch performance summaries for pms_year (both H1 and H2)
        perf_res = (
            supabase.table("performance_summaries")
            .select("user_id, period, total_score")
            .in_("user_id", user_ids)
            .eq("year", pms_year)
            .execute()
        )
        # Average H1 + H2 scores per user
        perf_by_user: dict = {}
        for row in (perf_res.data or []):
            uid = row["user_id"]
            perf_by_user.setdefault(uid, []).append(float(row["total_score"] or 0))

        avg_score_by_user = {
            uid: round(sum(scores) / len(scores), 2)
            for uid, scores in perf_by_user.items()
        }

        # Fetch potential assessments for pms_year
        potential_res = (
            supabase.table("potential_assessments")
            .select("employee_id, talent_block, overall_ability, overall_aspiration, overall_leadership")
            .in_("employee_id", user_ids)
            .eq("appraisal_cycle", pms_year)
            .execute()
        )
        potential_by_user = {
            row["employee_id"]: row
            for row in (potential_res.data or [])
        }

        # Build org location string per user
        def org_location(u: dict) -> str:
            parts = []
            country = (u.get("countries") or {}).get("name")
            branch  = (u.get("branches") or {}).get("name")
            dept    = (u.get("departments") or {}).get("name")
            subdept = (u.get("sub_departments") or {}).get("name")
            role    = u.get("role", "")

            if role == "country_admin" and country:
                return country
            if role == "branch_admin" and branch:
                return f"{branch}, {country}" if country else branch
            if role == "dept_admin" and dept:
                return f"{dept} — {branch}, {country}" if branch else dept
            if role == "sub_dept_admin" and subdept:
                return f"{subdept} — {dept}, {branch}" if dept else subdept
            # employee
            parts = [p for p in [subdept or dept, branch, country] if p]
            return " — ".join(parts) if parts else "—"

        # Assemble report rows
        result = []
        for u in users:
            uid = u["id"]
            potential = potential_by_user.get(uid, {})
            result.append({
                "id":            uid,
                "emp_id":        u.get("emp_id"),
                "full_name":     u["full_name"],
                "role":          u["role"],
                "org_location":  org_location(u),
                "country":       (u.get("countries") or {}).get("name"),
                "branch":        (u.get("branches") or {}).get("name"),
                "department":    (u.get("departments") or {}).get("name"),
                "sub_department":(u.get("sub_departments") or {}).get("name"),
                "avg_score":     avg_score_by_user.get(uid),
                "talent_block":  potential.get("talent_block"),
                "overall_ability":      potential.get("overall_ability"),
                "overall_aspiration":   potential.get("overall_aspiration"),
                "overall_leadership":   potential.get("overall_leadership"),
            })

        # Sort: country → branch → dept → sub-dept → employee
        role_order = {
            "country_admin": 1, "branch_admin": 2,
            "dept_admin": 3, "sub_dept_admin": 4, "employee": 5,
        }
        result.sort(key=lambda r: (
            r.get("country") or "",
            r.get("branch") or "",
            r.get("department") or "",
            r.get("sub_department") or "",
            role_order.get(r["role"], 9),
            r["full_name"],
        ))

        return jsonify(result)

    except Exception as exc:
        print(f"[ERROR] get_workforce_report: {exc}")
        return jsonify({"error": str(exc)}), 500