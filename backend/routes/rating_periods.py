"""
routes/rating_periods.py
-------------------------
Flask Blueprint for rating period management and completion tracking.

Rating period resolution order (most specific wins):
  1. sub_department_id match
  2. department_id match
  3. branch_id match
  4. country_id match
  5. global row (all NULLs) — fallback

Endpoints
---------
GET  /api/rating-periods/current           Resolved period for a specific user
GET  /api/rating-periods/org-hierarchy     Full org tree for cascade picker
POST /api/rating-periods/update            Create/update period row for a scope
GET  /api/rating-status/batch              Submission status for multiple users
GET  /api/rating-settings/overview/<id>   Team-wide completion overview
"""

from flask import Blueprint, jsonify, request
from datetime import date as dt_date
from collections import defaultdict

from services.score_service import get_active_period_params
from utils.db import supabase
from utils.helpers import parse_date

rating_periods_bp = Blueprint("rating_periods", __name__)


# ── Helpers ───────────────────────────────────────────────────────

def resolve_period_for_user(user: dict, rows: list) -> dict | None:
    """
    Given a user dict and a list of rating_periods rows (same pms_year+period),
    return the most specific matching row.
    Priority: sub_department → department → branch → country → global
    """
    sub_dept_id = user.get("sub_department_id")
    dept_id     = user.get("department_id")
    branch_id   = user.get("branch_id")
    country_id  = user.get("country_id")

    def find(country=None, branch=None, dept=None, sub=None):
        for r in rows:
            if (r.get("country_id")       == country and
                r.get("branch_id")        == branch  and
                r.get("department_id")    == dept    and
                r.get("sub_department_id") == sub):
                return r
        return None

    # Most specific first
    checks = []
    if sub_dept_id:
        checks.append(dict(country=country_id, branch=branch_id,
                           dept=dept_id, sub=sub_dept_id))
    if dept_id:
        checks.append(dict(country=country_id, branch=branch_id,
                           dept=dept_id, sub=None))
    if branch_id:
        checks.append(dict(country=country_id, branch=branch_id,
                           dept=None, sub=None))
    if country_id:
        checks.append(dict(country=country_id, branch=None,
                           dept=None, sub=None))
    # Global fallback
    checks.append(dict(country=None, branch=None, dept=None, sub=None))

    for c in checks:
        r = find(**c)
        if r:
            return r
    return rows[0] if rows else None


def get_user_org(user_id: str) -> dict:
    res = (
        supabase.table("users")
        .select("id, role, country_id, branch_id, department_id, sub_department_id")
        .eq("id", user_id)
        .single()
        .execute()
    )
    return res.data or {}


# ── Current rating period ─────────────────────────────────────────

@rating_periods_bp.route("/api/rating-periods/current", methods=["GET"])
def get_current_rating_period():
    """
    Return the resolved rating period state for a specific user.

    Query params
    ------------
    user_id  str  — resolve the most specific period for this user
    """
    try:
        user_id = request.args.get("user_id", "").strip()

        result = (
            supabase.table("rating_periods")
            .select("*")
            .eq("is_active", True)
            .execute()
        )

        if not result.data:
            return jsonify({
                "rating_open": False, "active_period": None,
                "reason": "No active rating periods configured", "periods": [],
            })

        all_rows = result.data
        today    = dt_date.today()
        user     = get_user_org(user_id) if user_id else {}

        # Group by (pms_year, period), resolve most specific per group
        grouped: dict[tuple, list] = defaultdict(list)
        for rp in all_rows:
            grouped[(rp["pms_year"], rp["period"])].append(rp)

        resolved = []
        for rows in grouped.values():
            best = resolve_period_for_user(user, rows)
            if best:
                resolved.append(best)

        resolved.sort(key=lambda r: (r["pms_year"], r["period"]))

        # Check if any window is open today
        active = None
        for rp in resolved:
            s = parse_date(rp["rating_start"])
            e = parse_date(rp["rating_end"])
            if s and e and s <= today <= e:
                active = rp
                break

        if active:
            return jsonify({
                "rating_open": True,
                "active_period": active["period"],
                "pms_year": active["pms_year"],
                "rating_start": active["rating_start"],
                "rating_end": active["rating_end"],
                "reason": None,
                "periods": resolved,
            })

        # No open window — find most recently completed
        past = [rp for rp in resolved
                if parse_date(rp["rating_end"]) and parse_date(rp["rating_end"]) < today]

        if past:
            mr = max(past, key=lambda rp: parse_date(rp["rating_end"]))
        else:
            upcoming = [rp for rp in resolved
                        if parse_date(rp["rating_start"]) and
                        parse_date(rp["rating_start"]) > today]
            mr = (min(upcoming, key=lambda rp: parse_date(rp["rating_start"]))
                  if upcoming else (resolved[0] if resolved else None))

        if not mr:
            return jsonify({"rating_open": False, "active_period": None,
                            "reason": "No periods found", "periods": []})

        s = parse_date(mr["rating_start"])
        reason = (f"Rating window opens on {s.strftime('%d %b %Y')}"
                  if s and s > today else "Rating window has closed for this period")

        return jsonify({
            "rating_open": False,
            "active_period": mr["period"],
            "pms_year": mr["pms_year"],
            "rating_start": mr["rating_start"],
            "rating_end": mr["rating_end"],
            "reason": reason,
            "periods": resolved,
        })

    except Exception as exc:
        print(f"[ERROR] get_current_rating_period: {exc}")
        import traceback; traceback.print_exc()
        return jsonify({"error": str(exc)}), 500


# ── Org hierarchy for cascade picker ─────────────────────────────

@rating_periods_bp.route("/api/rating-periods/org-hierarchy", methods=["GET"])
def get_org_hierarchy():
    """
    Return the full org tree scoped to the evaluator's permissions.

    HQ Admin    → sees all countries, branches, depts, sub-depts
    Country Admin → sees only branches/depts/sub-depts under their country
    """
    try:
        evaluator_id = request.args.get("evaluator_id", "").strip()
        role         = request.args.get("role", "").strip()

        if not evaluator_id:
            return jsonify({"error": "evaluator_id required"}), 400

        user_res = (
            supabase.table("users")
            .select("id, country_id")
            .eq("id", evaluator_id)
            .single()
            .execute()
        )
        if not user_res.data:
            return jsonify({"error": "User not found"}), 404

        evaluator_country_id = user_res.data.get("country_id")

        if role == "hq_admin":
            countries   = supabase.table("countries").select("id, name").order("name").execute().data or []
            branches    = supabase.table("branches").select("id, name, country_id").order("name").execute().data or []
            departments = supabase.table("departments").select("id, name, branch_id").order("name").execute().data or []
            sub_depts   = supabase.table("sub_departments").select("id, name, department_id").order("name").execute().data or []
            return jsonify({
                "countries": countries, "branches": branches,
                "departments": departments, "sub_departments": sub_depts,
            })

        elif role == "country_admin":
            if not evaluator_country_id:
                return jsonify({"countries": [], "branches": [], "departments": [], "sub_departments": []})

            branches    = supabase.table("branches").select("id, name, country_id").eq("country_id", evaluator_country_id).order("name").execute().data or []
            branch_ids  = [b["id"] for b in branches]
            departments = supabase.table("departments").select("id, name, branch_id").in_("branch_id", branch_ids).order("name").execute().data if branch_ids else []
            dept_ids    = [d["id"] for d in departments]
            sub_depts   = supabase.table("sub_departments").select("id, name, department_id").in_("department_id", dept_ids).order("name").execute().data if dept_ids else []
            return jsonify({
                "countries": [], "branches": branches,
                "departments": departments, "sub_departments": sub_depts,
            })

        return jsonify({"error": "Invalid role"}), 400

    except Exception as exc:
        print(f"[ERROR] get_org_hierarchy: {exc}")
        import traceback; traceback.print_exc()
        return jsonify({"error": str(exc)}), 500


# ── Update / create rating period row ────────────────────────────

@rating_periods_bp.route("/api/rating-periods/update", methods=["POST"])
def update_rating_period():
    """
    Upsert rating_period rows for a given scope.

    Body fields
    -----------
    period               str   e.g. "H1"
    pms_year             int   e.g. 2025
    rating_start         str   ISO date
    rating_end           str   ISO date
    evaluator_id         str
    include_self         bool  HQ only — also update the global row
    selected_countries   list  country UUIDs
    selected_branches    list  branch UUIDs
    selected_departments list  department UUIDs
    selected_sub_depts   list  sub-department UUIDs

    Each selected unit gets its own upsert at the correct specificity level.
    """
    try:
        body      = request.get_json()
        period    = body.get("period")
        pms_year  = body.get("pms_year")
        new_start = body.get("rating_start")
        new_end   = body.get("rating_end")

        if not all([period, pms_year, new_start, new_end]):
            return jsonify({"error": "Missing required fields"}), 400

        try:
            start_dt = dt_date.fromisoformat(new_start)
            end_dt   = dt_date.fromisoformat(new_end)
        except ValueError:
            return jsonify({"error": "Invalid date format. Use YYYY-MM-DD"}), 400

        if end_dt <= start_dt:
            return jsonify({"error": "rating_end must be after rating_start"}), 400

        evaluator_id  = body.get("evaluator_id", "")
        include_self  = bool(body.get("include_self", False))

        selected_countries   = body.get("selected_countries",   [])
        selected_branches    = body.get("selected_branches",    [])
        selected_departments = body.get("selected_departments", [])
        selected_sub_depts   = body.get("selected_sub_depts",   [])

        upserted = 0

        def do_upsert(country_id=None, branch_id=None,
                      department_id=None, sub_department_id=None):
            nonlocal upserted
            row = {
                "pms_year": int(pms_year), "period": period,
                "rating_start": new_start, "rating_end": new_end,
                "is_active": True,
                "country_id": country_id, "branch_id": branch_id,
                "department_id": department_id,
                "sub_department_id": sub_department_id,
            }
            supabase.table("rating_periods").upsert(
                row,
                on_conflict="pms_year,period,country_id,branch_id,department_id,sub_department_id"
            ).execute()
            upserted += 1

        # Global row — HQ include_self only
        if include_self:
            do_upsert()

        # Sub-departments (most specific)
        for sub_id in selected_sub_depts:
            r = supabase.table("sub_departments").select(
                "id, department_id, departments(branch_id, branches(country_id))"
            ).eq("id", sub_id).single().execute().data
            if not r: continue
            dept = r.get("departments") or {}
            br   = dept.get("branches") or {}
            do_upsert(
                country_id=br.get("country_id"),
                branch_id=dept.get("branch_id"),
                department_id=r.get("department_id"),
                sub_department_id=sub_id,
            )

        # Departments — skip if already covered by a sub-dept in same dept
        covered_depts = set()
        for sub_id in selected_sub_depts:
            r = supabase.table("sub_departments").select("department_id").eq("id", sub_id).single().execute().data
            if r: covered_depts.add(r["department_id"])

        for dept_id in selected_departments:
            if dept_id in covered_depts: continue
            r = supabase.table("departments").select(
                "id, branch_id, branches(country_id)"
            ).eq("id", dept_id).single().execute().data
            if not r: continue
            br = r.get("branches") or {}
            do_upsert(
                country_id=br.get("country_id"),
                branch_id=r.get("branch_id"),
                department_id=dept_id,
            )

        # Branches — skip if already covered by a dept in same branch
        covered_branches = set()
        for dept_id in selected_departments:
            r = supabase.table("departments").select("branch_id").eq("id", dept_id).single().execute().data
            if r: covered_branches.add(r["branch_id"])

        for branch_id in selected_branches:
            if branch_id in covered_branches: continue
            r = supabase.table("branches").select("id, country_id").eq("id", branch_id).single().execute().data
            if not r: continue
            do_upsert(country_id=r.get("country_id"), branch_id=branch_id)

        # Countries — skip if already covered by a branch in same country
        covered_countries = set()
        for branch_id in selected_branches:
            r = supabase.table("branches").select("country_id").eq("id", branch_id).single().execute().data
            if r: covered_countries.add(r["country_id"])

        for country_id in selected_countries:
            if country_id in covered_countries: continue
            do_upsert(country_id=country_id)

        if upserted == 0:
            return jsonify({"error": "No scope selected."}), 400

        print(f"[INFO] {period} {pms_year} updated — {upserted} row(s) by {evaluator_id}")
        return jsonify({"success": True, "rows_updated": upserted})

    except Exception as exc:
        print(f"[ERROR] update_rating_period: {exc}")
        import traceback; traceback.print_exc()
        return jsonify({"error": str(exc)}), 500


# ── Batch rating status ───────────────────────────────────────────

@rating_periods_bp.route("/api/rating-status/batch", methods=["GET"])
def get_batch_rating_status():
    try:
        raw_ids = request.args.get("user_ids", "").strip()
        year    = request.args.get("year", type=int)
        period  = request.args.get("period", "")

        if not raw_ids or not year or not period:
            return jsonify({"error": "user_ids, year, and period are required"}), 400

        user_ids = [uid.strip() for uid in raw_ids.split(",") if uid.strip()]
        if not user_ids:
            return jsonify({}), 200

        assign_res = supabase.table("template_assignments").select("user_id, template_id").in_("user_id", user_ids).execute()
        assign_by_user = {r["user_id"]: r["template_id"] for r in (assign_res.data or [])}
        template_ids = list(set(assign_by_user.values()))

        if not template_ids:
            return jsonify({uid: {"submitted": False, "pending": 0, "total": 0} for uid in user_ids})

        cat_res = supabase.table("categories").select("id, template_id").in_("template_id", template_ids).execute()
        all_cat_ids     = [c["id"] for c in (cat_res.data or [])]
        cat_to_template = {c["id"]: c["template_id"] for c in (cat_res.data or [])}

        if not all_cat_ids:
            return jsonify({uid: {"submitted": False, "pending": 0, "total": 0} for uid in user_ids})

        obj_res = supabase.table("objectives").select("id, category_id").in_("category_id", all_cat_ids).eq("kpi_scale", "manual").execute()
        objs_by_template: dict[int, list] = {}
        for obj in obj_res.data or []:
            tmpl = cat_to_template.get(obj["category_id"])
            if tmpl:
                objs_by_template.setdefault(tmpl, [])
                if obj["id"] not in objs_by_template[tmpl]:
                    objs_by_template[tmpl].append(obj["id"])

        all_obj_ids = [o["id"] for o in (obj_res.data or [])]
        if not all_obj_ids:
            return jsonify({uid: {"submitted": False, "pending": 0, "total": 0} for uid in user_ids})

        submitted_res = supabase.table("performance_records").select("user_id, objective_id, manual_rating").in_("user_id", user_ids).in_("objective_id", all_obj_ids).eq("year", int(year)).eq("period", str(period)).execute()
        submitted_by_user: dict[str, list] = {}
        for r in submitted_res.data or []:
            if r.get("manual_rating") is None: continue
            submitted_by_user.setdefault(r["user_id"], [])
            if r["objective_id"] not in submitted_by_user[r["user_id"]]:
                submitted_by_user[r["user_id"]].append(r["objective_id"])

        result = {}
        for uid in user_ids:
            template_id   = assign_by_user.get(uid)
            total_obj_ids = objs_by_template.get(template_id, []) if template_id else []
            total         = len(total_obj_ids)
            done          = len([o for o in submitted_by_user.get(uid, []) if o in total_obj_ids])
            result[uid]   = {"submitted": done == total and total > 0,
                             "pending": max(0, total - done), "total": total}

        return jsonify(result)

    except Exception as exc:
        import traceback
        print(f"[ERROR] get_batch_rating_status: {exc}"); traceback.print_exc()
        return jsonify({"error": str(exc)}), 500


# ── Rating settings overview ──────────────────────────────────────

@rating_periods_bp.route("/api/rating-settings/overview/<evaluator_id>", methods=["GET"])
def get_rating_overview(evaluator_id: str):
    try:
        active_year, active_period_str = get_active_period_params()
        period   = request.args.get("period", active_period_str)
        pms_year = request.args.get("year", active_year, type=int)

        team = supabase.table("users").select("id, full_name, role, designation_id, designations(name)").eq("manager_id", evaluator_id).execute().data or []
        overview = []

        for member in team:
            subs       = supabase.table("users").select("id").eq("manager_id", member["id"]).execute().data or []
            sub_ids    = [u["id"] for u in subs]
            total      = len(sub_ids)
            submitted  = 0

            if sub_ids:
                rated = supabase.table("performance_records").select("user_id, manual_rating").in_("user_id", sub_ids).eq("period", str(period)).eq("year", int(pms_year)).execute().data or []
                submitted = len(set(r["user_id"] for r in rated if r.get("manual_rating") is not None))

            pending = max(0, total - submitted)
            overview.append({
                "id": member["id"], "name": member["full_name"],
                "role": member["role"],
                "designation": (member.get("designations") or {}).get("name", ""),
                "total": total, "submitted": submitted, "pending": pending,
                "pct": round((submitted / total * 100) if total > 0 else 0, 1),
                "status": "n/a" if total == 0 else ("complete" if pending == 0 else "pending"),
            })

        return jsonify(overview)

    except Exception as exc:
        print(f"[ERROR] get_rating_overview: {exc}")
        return jsonify({"error": str(exc)}), 500