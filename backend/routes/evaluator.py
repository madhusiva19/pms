"""
routes/evaluator.py
--------------------
Flask Blueprint for evaluator (manager) actions.

Endpoints
---------
POST /api/evaluator/submit                       Submit manual ratings for a team member
GET  /api/evaluator/pending                      List objectives still missing a rating
GET  /api/evaluator/<id>/team                    Team members managed by an evaluator
GET  /api/evaluator/<id>/profile                 Evaluator profile + org context
GET  /api/manual-objectives/<user_id>            Manual KPIs for a user in a given period
GET  /api/rating-status/batch                    Submission status for multiple users
GET  /api/rating-periods/current                 Active/upcoming rating period info
POST /api/rating-periods/update                  Update rating period dates
GET  /api/rating-settings/overview/<evaluator>   Team-wide completion overview
GET  /api/feedback/<user_id>/<year>/<period>     Supervisor feedback for the period
GET  /api/recommendations/<user_id>/<year>/<p>   AI recommendations for the period
GET  /api/users/by-email                         Resolve a user UUID from an email
"""

from flask import Blueprint, jsonify, request

from services.rating_engine import load_scale_meta
from services.score_service import get_active_period_params, patch_total_score
from utils.db import LOCKED_ADMIN_UUID, supabase
from utils.helpers import parse_date

evaluator_bp = Blueprint("evaluator", __name__)


# ---------------------------------------------------------------------------
# Submit manual ratings
# ---------------------------------------------------------------------------

@evaluator_bp.route("/api/evaluator/submit", methods=["POST"])
def evaluator_submit():
    """
    Save a batch of manual ratings submitted by an evaluator for one team member.

    Validation rules
    ----------------
    - Rating must be 1.00 – 5.00.
    - A comment is required when rating < 3.0.
    - The objective must use the "manual" KPI scale.
    """
    try:
        body         = request.get_json()
        user_id      = body.get("user_id")
        evaluator_id = body.get("evaluator_id")
        year         = body.get("year")
        period       = body.get("period")
        ratings      = body.get("ratings", [])

        if not all([user_id, evaluator_id, year, period]):
            return jsonify({"error": "Missing required fields"}), 400

        if not ratings:
            return jsonify({
                "success":     True,
                "updated":     0,
                "total_score": None,
                "message":     "No ratings provided — nothing to save.",
            })

        mappings_by_obj, _, obj_by_id, _ = load_scale_meta()
        updated_count = 0

        for entry in ratings:
            obj_id         = entry.get("objective_id")
            manual_rating  = entry.get("manual_rating")
            rating_comment = entry.get("rating_comment", None)

            if not obj_id or manual_rating is None:
                continue

            manual_rating = round(float(manual_rating), 2)

            # Validate rating range
            if not (1.0 <= manual_rating <= 5.0):
                return jsonify({
                    "error": (
                        f"Rating for objective {obj_id} must be between 1.00 and 5.00"
                    )
                }), 400

            # Comment is mandatory for below-threshold ratings
            if manual_rating < 3.0:
                if not rating_comment or not str(rating_comment).strip():
                    return jsonify({
                        "error": (
                            f"A comment is required for objective {obj_id} "
                            "because the rating is below 3.0"
                        )
                    }), 400

            # Sanitise comment: store None instead of empty string
            rating_comment = (
                str(rating_comment).strip()
                if rating_comment and str(rating_comment).strip()
                else None
            )

            obj     = obj_by_id.get(obj_id, {})
            mapping = mappings_by_obj.get(obj_id, {})

            # Prevent accidentally rating non-manual KPIs via this endpoint
            if mapping.get("scale_type") != "manual":
                return jsonify(
                    {"error": f"Objective {obj_id} is not a manual-rated KPI"}
                ), 400

            weight = float(obj.get("weight", 0))
            score  = round(manual_rating * (weight / 100), 4)

            supabase.table("performance_records").upsert(
                {
                    "user_id":        user_id,
                    "objective_id":   obj_id,
                    "period":         period,
                    "year":           year,
                    "target":         None,
                    "actual":         None,
                    "manual_rating":  manual_rating,
                    "rating":         manual_rating,
                    "score":          score,
                    "rating_comment": rating_comment,
                    "status":         "approved",
                },
                on_conflict="user_id,objective_id,period,year",
            ).execute()

            updated_count += 1

        total = patch_total_score(user_id, year, period)

        return jsonify({
            "success":     True,
            "updated":     updated_count,
            "total_score": total,
            "message":     f"{updated_count} manual ratings saved successfully",
        })

    except Exception as exc:
        print(f"[ERROR] evaluator_submit: {exc}")
        return jsonify({"error": str(exc)}), 500


# ---------------------------------------------------------------------------
# Pending evaluations
# ---------------------------------------------------------------------------

@evaluator_bp.route("/api/evaluator/pending", methods=["GET"])
def get_pending_evaluations():
    """
    Return a list of manual KPI objectives that have not yet been rated for
    a given user and period.
    """
    try:
        user_id = request.args.get("user_id")
        active_year, active_period = get_active_period_params()
        year   = request.args.get("year",   active_year)
        period = request.args.get("period", active_period)

        if not user_id:
            return jsonify({"error": "user_id required"}), 400

        mappings_by_obj, _, obj_by_id, cat_by_id = load_scale_meta()

        # Collect all manual objective ids across every mapping
        manual_obj_ids = [
            obj_id
            for obj_id, mapping in mappings_by_obj.items()
            if mapping.get("scale_type") == "manual"
        ]

        # Find which have already been submitted
        existing = (
            supabase.table("performance_records")
            .select("objective_id, manual_rating")
            .eq("user_id", user_id)
            .eq("year", year)
            .eq("period", period)
            .execute()
        )
        submitted_ids = {
            r["objective_id"]
            for r in existing.data
            if r.get("manual_rating") is not None
        }

        pending = []
        for obj_id in manual_obj_ids:
            if obj_id not in submitted_ids:
                obj = obj_by_id.get(obj_id, {})
                cat = cat_by_id.get(obj.get("category_id", 0), {})
                pending.append({
                    "objective_id":   obj_id,
                    "objective_name": obj.get("name", ""),
                    "category_name":  cat.get("name", ""),
                    "weight":         obj.get("weight", 0),
                })

        return jsonify({"pending": pending, "count": len(pending)})

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ---------------------------------------------------------------------------
# Evaluator team
# ---------------------------------------------------------------------------

@evaluator_bp.route("/api/evaluator/<evaluator_id>/team", methods=["GET"])
def get_evaluator_team(evaluator_id: str):
    """Return all users whose manager_id matches the evaluator's id."""
    try:
        result = (
            supabase.table("users")
            .select("id, full_name, designation_id, emp_id, designations(name)")
            .eq("manager_id", evaluator_id)
            .execute()
        )

        if not result.data:
            return jsonify([])

        team     = result.data
        user_ids = [u["id"] for u in team]

        # Batch-fetch template assignments
        assign_res = (
            supabase.table("template_assignments")
            .select("user_id, template_id, templates(id, name)")
            .in_("user_id", user_ids)
            .execute()
        )

        assign_by_user: dict = {}
        for row in assign_res.data or []:
            assign_by_user[row["user_id"]] = {
                "template_id":   row["template_id"],
                "template_name": (
                    row["templates"]["name"] if row.get("templates") else None
                ),
            }

        enriched = []
        for user in team:
            assignment = assign_by_user.get(user["id"])
            enriched.append({
                "id":            user["id"],
                "full_name":     user["full_name"],
                "designation":   (user.get("designations") or {}).get("name", ""),
                "emp_id":        user.get("emp_id", ""),
                "template_id":   assignment["template_id"]   if assignment else None,
                "template_name": assignment["template_name"] if assignment else None,
            })

        return jsonify(enriched)

    except Exception as exc:
        print(f"[ERROR] get_evaluator_team: {exc}")
        return jsonify({"error": str(exc)}), 500


# ---------------------------------------------------------------------------
# Evaluator profile
# ---------------------------------------------------------------------------

@evaluator_bp.route("/api/evaluator/<evaluator_id>/profile", methods=["GET"])
def get_evaluator_profile(evaluator_id: str):
    """
    Return the evaluator's profile with an ``org_context`` object that
    describes which organisational unit they administer.

    Used by the Manual Ratings page header.
    """
    try:
        user_res = (
            supabase.table("users")
            .select(
                "id, full_name, role, email, "
                "designation_id, designations(name), "
                "branch_id, branches(name), "
                "department_id, departments(name), "
                "country_id, countries(name), "
                "sub_department_id, sub_departments(name)"
            )
            .eq("id", evaluator_id)
            .single()
            .execute()
        )

        if not user_res.data:
            return jsonify({"error": "User not found"}), 404

        user = user_res.data
        role = user.get("role", "")

        # Map role to the relevant org-unit label and value
        org_context = None

        if role == "hq_admin":
            org_context = {"label": "HQ", "value": "Group Level"}
        elif role == "country_admin":
            org_context = {
                "label": "Country",
                "value": (user.get("countries") or {}).get("name", "—"),
            }
        elif role == "branch_admin":
            org_context = {
                "label": "Branch",
                "value": (user.get("branches") or {}).get("name", "—"),
            }
        elif role == "dept_admin":
            org_context = {
                "label": "Department",
                "value": (user.get("departments") or {}).get("name", "—"),
            }
        elif role == "sub_dept_admin":
            org_context = {
                "label": "Sub-Department",
                "value": (user.get("sub_departments") or {}).get("name", "—"),
            }

        return jsonify({
            "id":          user["id"],
            "full_name":   user.get("full_name", ""),
            "email":       user.get("email", ""),
            "role":        role,
            "designation": (user.get("designations") or {}).get("name", ""),
            "org_context": org_context,
        })

    except Exception as exc:
        print(f"[ERROR] get_evaluator_profile: {exc}")
        return jsonify({"error": str(exc)}), 500


# ---------------------------------------------------------------------------
# Manual objectives for a user
# ---------------------------------------------------------------------------

@evaluator_bp.route("/api/manual-objectives/<user_id>", methods=["GET"])
def get_manual_objectives(user_id: str):
    """
    Return all manual KPI objectives assigned to a user for a given period,
    pre-populated with any ratings already saved.
    """
    try:
        active_year, active_period = get_active_period_params()
        year   = request.args.get("year",   active_year, type=int)
        period = request.args.get("period", active_period)

        # Resolve which template this user is assigned to
        assign_res = (
            supabase.table("template_assignments")
            .select("template_id")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )

        if not assign_res.data:
            return jsonify({"error": "No template assigned to this user"}), 404

        template_id = assign_res.data[0]["template_id"]

        # Fetch categories for the template
        cat_res = (
            supabase.table("categories")
            .select("id, name")
            .eq("template_id", template_id)
            .order("id")
            .execute()
        )

        categories = cat_res.data or []
        cat_ids    = [c["id"] for c in categories]
        cat_map    = {c["id"]: c["name"] for c in categories}

        if not cat_ids:
            return jsonify([])

        # Fetch only manual objectives
        obj_res = (
            supabase.table("objectives")
            .select("id, name, weight, category_id, kpi_scale")
            .in_("category_id", cat_ids)
            .eq("kpi_scale", "manual")
            .order("id")
            .execute()
        )

        objectives = obj_res.data or []

        if not objectives:
            return jsonify([])

        obj_ids = [o["id"] for o in objectives]

        # Fetch any existing ratings for this period
        rec_res = (
            supabase.table("performance_records")
            .select("objective_id, manual_rating, rating_comment")
            .eq("user_id", user_id)
            .eq("year", year)
            .eq("period", period)
            .in_("objective_id", obj_ids)
            .execute()
        )

        existing_ratings: dict = {
            r["objective_id"]: r["manual_rating"]
            for r in (rec_res.data or [])
            if r.get("manual_rating") is not None
        }

        existing_comments: dict = {
            r["objective_id"]: r.get("rating_comment")
            for r in (rec_res.data or [])
        }

        result = []
        for obj in objectives:
            result.append({
                "objective_id":   obj["id"],
                "objective_name": obj["name"],
                "category_id":    obj["category_id"],
                "category_name":  cat_map.get(obj["category_id"], ""),
                "weight":         float(obj.get("weight", 0)),
                "kpi_scale":      obj.get("kpi_scale", "manual"),
                "manual_rating":  existing_ratings.get(obj["id"]),
                "rating_comment": existing_comments.get(obj["id"]),
            })

        return jsonify(result)

    except Exception as exc:
        print(f"[ERROR] get_manual_objectives: {exc}")
        return jsonify({"error": str(exc)}), 500


# ---------------------------------------------------------------------------
# Batch rating status
# ---------------------------------------------------------------------------

@evaluator_bp.route("/api/rating-status/batch", methods=["GET"])
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

        # ── 4. Submitted records for all users at once ────────────────────
        # Fetch all records for these users/objectives/period, then filter
        # out null manual_rating in Python — avoids Supabase client IS NOT NULL
        # syntax variations that differ across library versions.
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
            # Filter out rows where manual_rating was never set
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

            # Only count objectives that belong to this user's template
            done    = len([oid for oid in submitted_ids if oid in total_obj_ids])
            pending = max(0, total - done)

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
# Rating periods
# ---------------------------------------------------------------------------

@evaluator_bp.route("/api/rating-periods/current", methods=["GET"])
def get_current_rating_period():
    """
    Return the current (or upcoming) rating period state.

    Response includes ``rating_open``, ``active_period``, date boundaries,
    and the full ``periods`` list for client-side period selection.
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
            # Find the nearest upcoming period
            upcoming = None
            for rp in result.data:
                start = parse_date(rp["rating_start"])
                if start and today < start:
                    if upcoming is None or start < parse_date(upcoming["rating_start"]):
                        upcoming = rp

            reason = (
                f"Rating window opens on {parse_date(upcoming['rating_start']).strftime('%d %b %Y')}"
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


@evaluator_bp.route("/api/rating-periods/update", methods=["POST"])
def update_rating_period():
    """
    Update rating period dates with full 5-combination scope control.

    Scope combinations
    ------------------
    include_self=True  + units selected (all)      → Myself + All units
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

        # Guard: nothing selected at all
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

            user = user_res.data
            role = user.get("role", "")

            # Build a targeted query scoped to only the evaluator's own row
            query = (
                supabase.table("rating_periods")
                .update(update_payload)
                .eq("period", period)
                .eq("pms_year", pms_year)
            )

            # Narrow by org-unit column matching the evaluator's role
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
# Rating settings overview
# ---------------------------------------------------------------------------

@evaluator_bp.route("/api/rating-settings/overview/<evaluator_id>", methods=["GET"])
def get_rating_overview(evaluator_id: str):
    """
    Return a per-team-member overview of manual rating completion for the
    evaluator's direct reports.

    For each team member (subordinate of the evaluator), we count:
      - total:     how many of THEIR own direct reports exist (people they must rate)
      - submitted: how many of those have at least one manual rating recorded
      - pending:   total - submitted

    Status values
    -------------
    "complete"  — total > 0 and all subordinates have been rated
    "n/a"       — total == 0 (this member has no subordinates to rate)
    "pending"   — total > 0 and at least one subordinate is still unrated

    The "Members To Rate" column therefore shows e.g. 0 / 3 → 2 / 3 → 3 / 3
    as the member progressively rates their own subordinates.
    """
    try:
        active_year, active_period_str = get_active_period_params()
        period   = request.args.get("period", active_period_str)
        pms_year = request.args.get("year",   active_year, type=int)

        # The evaluator's direct reports (shown as rows in the overview table)
        team_res = (
            supabase.table("users")
            .select("id, full_name, role, designation_id, designations(name)")
            .eq("manager_id", evaluator_id)
            .execute()
        )
        team = team_res.data or []

        overview = []

        for member in team:

            # ── How many people does THIS member need to rate? ───────────────
            # i.e. their own direct reports
            subordinates_res = (
                supabase.table("users")
                .select("id")
                .eq("manager_id", member["id"])
                .execute()
            )
            subordinate_ids = [u["id"] for u in (subordinates_res.data or [])]
            total_members   = len(subordinate_ids)

            # ── How many of those subordinates have been rated already? ──────
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
                # Count distinct subordinates with at least one non-null rating
                submitted = len(set(
                    r["user_id"] for r in (rated_res.data or [])
                    if r.get("manual_rating") is not None
                ))

            pending = max(0, total_members - submitted)

            # ── FIX: distinguish "no subordinates" from "pending" ────────────
            # "n/a"      → member has no subordinates to rate at all
            # "complete" → all subordinates have been rated
            # "pending"  → some subordinates still unrated
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


# ---------------------------------------------------------------------------
# Supervisor feedback
# ---------------------------------------------------------------------------

@evaluator_bp.route(
    "/api/feedback/<user_id>/<int:year>/<period>",
    methods=["GET"],
)
def get_supervisor_feedback(user_id: str, year: int, period: str):
    """Return the most recent supervisor feedback comment for a period."""
    try:
        eval_res = (
            supabase.table("evaluations")
            .select(
                "id, evaluator_id, "
                "users!evaluations_evaluator_id_fkey(full_name, designation_id, designations(name))"
            )
            .eq("user_id", user_id)
            .eq("year", year)
            .eq("period", period)
            .limit(1)
            .execute()
        )

        if not eval_res.data:
            return jsonify({"feedback": None, "evaluator": None})

        evaluation = eval_res.data[0]
        evaluator  = evaluation.get("users") or {}

        feedback_res = (
            supabase.table("feedback")
            .select("comment, rating")
            .eq("evaluation_id", evaluation["id"])
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )

        feedback = feedback_res.data[0] if feedback_res.data else {}

        return jsonify({
            "feedback": feedback.get("comment"),
            "rating":   feedback.get("rating"),
            "evaluator": {
                "name":        evaluator.get("full_name", "Supervisor"),
                "designation": (evaluator.get("designations") or {}).get("name", ""),
            } if evaluator else None,
        })

    except Exception as exc:
        print(f"[ERROR] get_supervisor_feedback: {exc}")
        return jsonify({"error": str(exc)}), 500


# ---------------------------------------------------------------------------
# AI recommendations
# ---------------------------------------------------------------------------

@evaluator_bp.route(
    "/api/recommendations/<user_id>/<int:year>/<period>",
    methods=["GET"],
)
def get_recommendations(user_id: str, year: int, period: str):
    """Return AI-generated performance recommendations ordered by sort_order."""
    try:
        result = (
            supabase.table("performance_ai_recommendations")
            .select("insight_text, insight_type, sort_order")
            .eq("user_id", user_id)
            .eq("year", year)
            .eq("period", period)
            .order("sort_order")
            .execute()
        )

        return jsonify(result.data or [])

    except Exception as exc:
        print(f"[ERROR] get_recommendations: {exc}")
        return jsonify({"error": str(exc)}), 500


# ---------------------------------------------------------------------------
# Utility: resolve user by email
# ---------------------------------------------------------------------------

@evaluator_bp.route("/api/users/by-email", methods=["GET"])
def get_user_by_email():
    """Return a user's UUID and profile from their email address."""
    email = request.args.get("email", "").strip()

    if not email:
        return jsonify({"error": "email required"}), 400

    try:
        result = (
            supabase.table("users")
            .select("id, email, full_name, role")
            .eq("email", email)
            .limit(1)
            .execute()
        )

        if not result.data:
            return jsonify({"error": "User not found"}), 404

        return jsonify(result.data[0])

    except Exception as exc:
        print(f"[ERROR] get_user_by_email: {exc}")
        return jsonify({"error": str(exc)}), 500