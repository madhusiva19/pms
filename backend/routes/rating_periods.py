"""
routes/rating_periods.py
-------------------------
Flask Blueprint for rating period management and completion tracking.

Endpoints
---------
GET  /api/rating-periods/current                 Active/upcoming rating period info
POST /api/rating-periods/update                  Update rating period dates
GET  /api/rating-status/batch                    Submission status for multiple users
GET  /api/rating-settings/overview/<evaluator>   Team-wide completion overview
"""

from flask import Blueprint, jsonify, request

from services.score_service import get_active_period_params
from utils.db import supabase
from utils.helpers import parse_date

rating_periods_bp = Blueprint("rating_periods", __name__)


# ---------------------------------------------------------------------------
# Current rating period
# ---------------------------------------------------------------------------

@rating_periods_bp.route("/api/rating-periods/current", methods=["GET"])
def get_current_rating_period():
    """
    Return the current (or upcoming) rating period state.

    Response includes rating_open, active_period, date boundaries,
    and the full periods list for client-side period selection.
    """
    try:
        from datetime import date as dt_date

        result = (
            supabase.table("rating_periods")
            .select("*")
            .eq("is_active", True)
            .execute()
        )

        if not result.data:
            return jsonify({
                "rating_open":   False,
                "active_period": None,
                "reason":        "No active rating periods configured",
            })

        today  = dt_date.today()
        active = None

        for rp in result.data:
            start = parse_date(rp["rating_start"])
            end   = parse_date(rp["rating_end"])
            if start and end and start <= today <= end:
                active = rp
                break

        if not active:
            upcoming = None
            for rp in result.data:
                start = parse_date(rp["rating_start"])
                if start and today < start:
                    if upcoming is None or start < parse_date(upcoming["rating_start"]):
                        upcoming = rp

            reason = (
                f"Rating window opens on "
                f"{parse_date(upcoming['rating_start']).strftime('%d %b %Y')}"
                if upcoming
                else "Rating window has closed for this cycle"
            )

            return jsonify({
                "rating_open":   False,
                "active_period": None,
                "reason":        reason,
                "periods":       result.data,
            })

        return jsonify({
            "rating_open":   True,
            "active_period": active["period"],
            "pms_year":      active["pms_year"],
            "rating_start":  active["rating_start"],
            "rating_end":    active["rating_end"],
            "reason":        None,
            "periods":       result.data,
        })

    except Exception as exc:
        print(f"[ERROR] get_current_rating_period: {exc}")
        return jsonify({"error": str(exc)}), 500


# ---------------------------------------------------------------------------
# Update rating period
# ---------------------------------------------------------------------------

@rating_periods_bp.route("/api/rating-periods/update", methods=["POST"])
def update_rating_period():
    """
    Update rating period dates with full 5-combination scope control.

    Scope combinations
    ------------------
    include_self=True  + units selected (all)       → Myself + All units
    include_self=True  + units selected (specific)  → Myself + Selected units
    include_self=True  + no units selected           → Myself only
    include_self=False + units selected (all)        → All units (excluding myself)
    include_self=False + units selected (specific)   → Selected units only

    Fields
    ------
    include_self         bool  — also update the evaluator's own period row
    evaluator_id         str   — always required so backend can resolve the self row
    affected_countries   list  — country ids  (HQ admin only)
    affected_branches    list  — branch ids
    affected_departments list  — department ids
    affected_sub_depts   list  — sub-department ids
    """
    try:
        body      = request.get_json()
        period    = body.get("period")
        pms_year  = body.get("pms_year")
        new_start = body.get("rating_start")
        new_end   = body.get("rating_end")

        if not all([period, pms_year, new_start, new_end]):
            return jsonify({"error": "Missing required fields"}), 400

        include_self = bool(body.get("include_self", False))
        evaluator_id = body.get("evaluator_id")

        update_payload = {"rating_start": new_start, "rating_end": new_end}

        affected_countries   = body.get("affected_countries",   [])
        affected_branches    = body.get("affected_branches",    [])
        affected_departments = body.get("affected_departments", [])
        affected_sub_depts   = body.get("affected_sub_depts",   [])

        has_units = any([
            affected_countries,
            affected_branches,
            affected_departments,
            affected_sub_depts,
        ])

        if not has_units and not include_self:
            return jsonify({
                "success": False,
                "message": (
                    "No scope selected — please choose at least one unit "
                    "or enable Include Myself."
                ),
            }), 400

        # ── Step 1: Update org-unit rows ──────────────────────────────────
        if has_units:
            # Always update the base (global) row first
            (
                supabase.table("rating_periods")
                .update(update_payload)
                .eq("period", period)
                .eq("pms_year", pms_year)
                .execute()
            )

            for country_id in (affected_countries or []):
                (
                    supabase.table("rating_periods")
                    .update(update_payload)
                    .eq("period", period)
                    .eq("pms_year", pms_year)
                    .eq("country_id", country_id)
                    .execute()
                )

            for branch_id in (affected_branches or []):
                (
                    supabase.table("rating_periods")
                    .update(update_payload)
                    .eq("period", period)
                    .eq("pms_year", pms_year)
                    .eq("branch_id", branch_id)
                    .execute()
                )

            for dept_id in (affected_departments or []):
                (
                    supabase.table("rating_periods")
                    .update(update_payload)
                    .eq("period", period)
                    .eq("pms_year", pms_year)
                    .eq("department_id", dept_id)
                    .execute()
                )

            for sub_id in (affected_sub_depts or []):
                (
                    supabase.table("rating_periods")
                    .update(update_payload)
                    .eq("period", period)
                    .eq("pms_year", pms_year)
                    .eq("sub_department_id", sub_id)
                    .execute()
                )

            print(
                f"[INFO] Rating period {period} {pms_year} updated for units — "
                f"countries: {affected_countries}, branches: {affected_branches}, "
                f"departments: {affected_departments}, sub_depts: {affected_sub_depts}."
            )

        # ── Step 2: Optionally update the evaluator's own row ─────────────
        if include_self:
            if not evaluator_id:
                return jsonify({
                    "error": "evaluator_id is required when include_self is true"
                }), 400

            user_res = (
                supabase.table("users")
                .select("id, role, branch_id, department_id, sub_department_id, country_id")
                .eq("id", evaluator_id)
                .single()
                .execute()
            )

            if not user_res.data:
                return jsonify({"error": "Evaluator not found"}), 404

            user  = user_res.data
            role  = user.get("role", "")
            query = (
                supabase.table("rating_periods")
                .update(update_payload)
                .eq("period", period)
                .eq("pms_year", pms_year)
            )

            if role == "branch_admin" and user.get("branch_id"):
                query = query.eq("branch_id", user["branch_id"])
            elif role == "dept_admin" and user.get("department_id"):
                query = query.eq("department_id", user["department_id"])
            elif role == "sub_dept_admin" and user.get("sub_department_id"):
                query = query.eq("sub_department_id", user["sub_department_id"])
            elif role == "country_admin" and user.get("country_id"):
                query = query.eq("country_id", user["country_id"])
            # hq_admin: no additional filter — they own the global row

            query.execute()

            print(
                f"[INFO] Rating period {period} {pms_year} also updated for "
                f"evaluator {evaluator_id} (role={role}) — include_self=True."
            )

        return jsonify({"success": True})

    except Exception as exc:
        print(f"[ERROR] update_rating_period: {exc}")
        return jsonify({"error": str(exc)}), 500


# ---------------------------------------------------------------------------
# Batch rating status
# ---------------------------------------------------------------------------

@rating_periods_bp.route("/api/rating-status/batch", methods=["GET"])
def get_batch_rating_status():
    """
    Return submission status for multiple users in a single round-trip.

    Query params: user_ids (comma-separated), year, period.
    Response shape: { "<user_id>": { submitted, pending, total } }
    """
    try:
        raw_ids = request.args.get("user_ids", "").strip()
        year    = request.args.get("year",    type=int)
        period  = request.args.get("period",  "")

        if not raw_ids or not year or not period:
            return jsonify({"error": "user_ids, year, and period are required"}), 400

        user_ids = [uid.strip() for uid in raw_ids.split(",") if uid.strip()]

        if not user_ids:
            return jsonify({}), 200

        # ── 1. Template assignment per user ────────────────────────────────
        assign_res = (
            supabase.table("template_assignments")
            .select("user_id, template_id")
            .in_("user_id", user_ids)
            .execute()
        )
        assign_by_user: dict = {
            r["user_id"]: r["template_id"] for r in (assign_res.data or [])
        }

        template_ids = list(set(assign_by_user.values()))

        if not template_ids:
            return jsonify({
                uid: {"submitted": False, "pending": 0, "total": 0}
                for uid in user_ids
            })

        # ── 2. Categories for all templates ────────────────────────────────
        cat_res = (
            supabase.table("categories")
            .select("id, template_id")
            .in_("template_id", template_ids)
            .execute()
        )
        all_cat_ids     = [c["id"]          for c in (cat_res.data or [])]
        cat_to_template = {c["id"]: c["template_id"] for c in (cat_res.data or [])}

        if not all_cat_ids:
            return jsonify({
                uid: {"submitted": False, "pending": 0, "total": 0}
                for uid in user_ids
            })

        # ── 3. Manual objectives for all categories ────────────────────────
        obj_res = (
            supabase.table("objectives")
            .select("id, category_id")
            .in_("category_id", all_cat_ids)
            .eq("kpi_scale", "manual")
            .execute()
        )

        objs_by_template: dict[int, list] = {}
        for obj in obj_res.data or []:
            tmpl = cat_to_template.get(obj["category_id"])
            if tmpl:
                objs_by_template.setdefault(tmpl, [])
                if obj["id"] not in objs_by_template[tmpl]:
                    objs_by_template[tmpl].append(obj["id"])

        all_obj_ids = [o["id"] for o in (obj_res.data or [])]

        if not all_obj_ids:
            return jsonify({
                uid: {"submitted": False, "pending": 0, "total": 0}
                for uid in user_ids
            })

        # ── 4. Fetch submitted records, filter nulls in Python ─────────────
        # Avoids Supabase client IS NOT NULL syntax variations across versions
        submitted_res = (
            supabase.table("performance_records")
            .select("user_id, objective_id, manual_rating")
            .in_("user_id", user_ids)
            .in_("objective_id", all_obj_ids)
            .eq("year", int(year))
            .eq("period", str(period))
            .execute()
        )

        submitted_by_user: dict[str, list] = {}
        for r in submitted_res.data or []:
            if r.get("manual_rating") is None:
                continue
            submitted_by_user.setdefault(r["user_id"], [])
            if r["objective_id"] not in submitted_by_user[r["user_id"]]:
                submitted_by_user[r["user_id"]].append(r["objective_id"])

        # ── 5. Compute per-user result ─────────────────────────────────────
        result: dict = {}
        for uid in user_ids:
            template_id   = assign_by_user.get(uid)
            total_obj_ids = objs_by_template.get(template_id, []) if template_id else []
            total         = len(total_obj_ids)
            submitted_ids = submitted_by_user.get(uid, [])
            done          = len([oid for oid in submitted_ids if oid in total_obj_ids])
            pending       = max(0, total - done)

            result[uid] = {
                "submitted": done == total and total > 0,
                "pending":   pending,
                "total":     total,
            }

        return jsonify(result)

    except Exception as exc:
        import traceback
        print(f"[ERROR] get_batch_rating_status: {exc}")
        print(traceback.format_exc())
        return jsonify({"error": str(exc)}), 500


# ---------------------------------------------------------------------------
# Rating settings overview
# ---------------------------------------------------------------------------

@rating_periods_bp.route("/api/rating-settings/overview/<evaluator_id>", methods=["GET"])
def get_rating_overview(evaluator_id: str):
    """
    Return a per-team-member overview of manual rating completion for the
    evaluator's direct reports.

    For each team member we count how many of THEIR own direct reports
    have been rated (submitted) vs still pending.

    Status values
    -------------
    "complete"  — total > 0 and all subordinates rated
    "n/a"       — total == 0 (this member has no subordinates to rate)
    "pending"   — total > 0 and at least one subordinate still unrated
    """
    try:
        active_year, active_period_str = get_active_period_params()
        period   = request.args.get("period", active_period_str)
        pms_year = request.args.get("year",   active_year, type=int)

        team_res = (
            supabase.table("users")
            .select("id, full_name, role, designation_id, designations(name)")
            .eq("manager_id", evaluator_id)
            .execute()
        )
        team     = team_res.data or []
        overview = []

        for member in team:
            subordinates_res = (
                supabase.table("users")
                .select("id")
                .eq("manager_id", member["id"])
                .execute()
            )
            subordinate_ids = [u["id"] for u in (subordinates_res.data or [])]
            total_members   = len(subordinate_ids)

            submitted = 0
            if subordinate_ids:
                rated_res = (
                    supabase.table("performance_records")
                    .select("user_id, manual_rating")
                    .in_("user_id", subordinate_ids)
                    .eq("period", str(period))
                    .eq("year", int(pms_year))
                    .execute()
                )
                submitted = len(set(
                    r["user_id"] for r in (rated_res.data or [])
                    if r.get("manual_rating") is not None
                ))

            pending = max(0, total_members - submitted)

            if total_members == 0:
                status = "n/a"
            elif pending == 0:
                status = "complete"
            else:
                status = "pending"

            overview.append({
                "id":          member["id"],
                "name":        member["full_name"],
                "role":        member["role"],
                "designation": (member.get("designations") or {}).get("name", ""),
                "total":       total_members,
                "submitted":   submitted,
                "pending":     pending,
                "pct":         round(
                    (submitted / total_members * 100) if total_members > 0 else 0, 1
                ),
                "status":      status,
            })

        return jsonify(overview)

    except Exception as exc:
        print(f"[ERROR] get_rating_overview: {exc}")
        return jsonify({"error": str(exc)}), 500