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
    Return the current (or most recently completed) rating period state.

    - If a period window is open today  → rating_open=True, active_period=that period
    - If no window is open              → rating_open=False, active_period=None
      and the frontend should display the MOST RECENTLY COMPLETED period
      (the one whose rating_end is the latest date still in the past).
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
                "periods":       [],
            })

        today  = dt_date.today()
        active = None

        # Check if any period window is currently open
        for rp in result.data:
            start = parse_date(rp["rating_start"])
            end   = parse_date(rp["rating_end"])
            if start and end and start <= today <= end:
                active = rp
                break

        if active:
            return jsonify({
                "rating_open":   True,
                "active_period": active["period"],
                "pms_year":      active["pms_year"],
                "rating_start":  active["rating_start"],
                "rating_end":    active["rating_end"],
                "reason":        None,
                "periods":       result.data,
            })

        # No window open — find the most recently COMPLETED period
        # (rating_end is in the past). This is what the UI should display.
        past_periods = [
            rp for rp in result.data
            if parse_date(rp["rating_end"]) and parse_date(rp["rating_end"]) < today
        ]

        if past_periods:
            most_recent = max(
                past_periods,
                key=lambda rp: parse_date(rp["rating_end"])
            )
        else:
            # No past periods either — fall back to the soonest upcoming one
            upcoming_periods = [
                rp for rp in result.data
                if parse_date(rp["rating_start"]) and parse_date(rp["rating_start"]) > today
            ]
            most_recent = (
                min(upcoming_periods, key=lambda rp: parse_date(rp["rating_start"]))
                if upcoming_periods
                else result.data[0]
            )

        reason = (
            f"Rating window opens on "
            f"{parse_date(most_recent['rating_start']).strftime('%d %b %Y')}"
            if parse_date(most_recent["rating_start"]) > today
            else "Rating window has closed for this period"
        )

        return jsonify({
            "rating_open":   False,
            "active_period": most_recent["period"],
            "pms_year":      most_recent["pms_year"],
            "rating_start":  most_recent["rating_start"],
            "rating_end":    most_recent["rating_end"],
            "reason":        reason,
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
    Update rating period dates.

    The rating_periods table has NO org-unit FK columns (country_id,
    branch_id, department_id, sub_department_id do NOT exist on that table).
    There is exactly ONE row per (pms_year, period) combination.

    The scope UI (countries / branches / departments / sub-departments) is
    kept for UX familiarity, but on the backend we simply update the single
    matching row for (period, pms_year). The "include_self" flag has no
    separate effect since there is only one row to update.

    Fields
    ------
    period       str  — e.g. "H1"
    pms_year     int  — e.g. 2026
    rating_start str  — ISO date "YYYY-MM-DD"
    rating_end   str  — ISO date "YYYY-MM-DD"
    evaluator_id str  — required for audit logging
    include_self bool — accepted but no separate action needed (single row)
    affected_countries / affected_branches / affected_departments /
    affected_sub_depts — accepted for forward-compatibility, currently no-op
                         because the table has no such FK columns.
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
        evaluator_id = body.get("evaluator_id", "")

        # Validate dates
        from datetime import date as dt_date
        try:
            start_dt = dt_date.fromisoformat(new_start)
            end_dt   = dt_date.fromisoformat(new_end)
        except ValueError:
            return jsonify({"error": "Invalid date format. Use YYYY-MM-DD"}), 400

        if end_dt <= start_dt:
            return jsonify({"error": "rating_end must be after rating_start"}), 400

        # Scope validation: at least one scope must be selected
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
                "error": (
                    "No scope selected — please choose at least one unit "
                    "or enable Include Myself."
                ),
            }), 400

        # Update the single rating_periods row for this (period, pms_year)
        update_payload = {"rating_start": new_start, "rating_end": new_end}

        res = (
            supabase.table("rating_periods")
            .update(update_payload)
            .eq("period", period)
            .eq("pms_year", int(pms_year))
            .execute()
        )

        if not res.data:
            return jsonify({
                "error": f"No rating period found for {period} {pms_year}"
            }), 404

        print(
            f"[INFO] Rating period {period} {pms_year} updated to "
            f"{new_start} → {new_end} by evaluator {evaluator_id} "
            f"(include_self={include_self}, "
            f"countries={affected_countries}, branches={affected_branches}, "
            f"departments={affected_departments}, sub_depts={affected_sub_depts})"
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