"""
routes/evaluator.py
--------------------
Flask Blueprint for evaluator (manager) actions.

Endpoints
---------
POST /api/evaluator/submit          Submit manual ratings for a team member
GET  /api/evaluator/pending         List objectives still missing a rating
GET  /api/evaluator/<id>/team       Team members managed by an evaluator
GET  /api/evaluator/<id>/profile    Evaluator profile + org context
"""

from flask import Blueprint, jsonify, request

from services.rating_engine import load_scale_meta
from services.score_service import get_active_period_params, patch_total_score
from utils.db import supabase

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
        year         = body.get("pms_year")
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

            # Skip any malformed entries rather than aborting the whole batch
            if not obj_id or manual_rating is None:
                continue

            # Normalise to 2 decimal places before validation
            manual_rating = round(float(manual_rating), 2)

            if not (1.0 <= manual_rating <= 5.0):
                return jsonify({
                    "error": f"Rating for objective {obj_id} must be between 1.00 and 5.00"
                }), 400

            # Ratings below 3.0 must include a justification comment
            if manual_rating < 3.0:
                if not rating_comment or not str(rating_comment).strip():
                    return jsonify({
                        "error": (
                            f"A comment is required for objective {obj_id} "
                            "because the rating is below 3.0"
                        )
                    }), 400

            # Normalise whitespace; store None rather than an empty string
            rating_comment = (
                str(rating_comment).strip()
                if rating_comment and str(rating_comment).strip()
                else None
            )

            obj     = obj_by_id.get(obj_id, {})
            mapping = mappings_by_obj.get(obj_id, {})

            # Only manual-scale objectives should be submitted through this endpoint
            if mapping.get("scale_type") != "manual":
                return jsonify(
                    {"error": f"Objective {obj_id} is not a manual-rated KPI"}
                ), 400

            # Score = rating × (weight / 100), e.g. rating 4 on a 15% objective = 0.60
            weight = float(obj.get("weight", 0))
            score  = round(manual_rating * (weight / 100), 4)

            # Upsert so re-submissions overwrite rather than duplicate
            supabase.table("performance_records").upsert(
                {
                    "user_id":        user_id,
                    "objective_id":   obj_id,
                    "period":         period,
                    "year":              year,
                    "target":         None,
                    "actual":         None,
                    "manual_rating":  manual_rating,
                    "rating":         manual_rating,
                    "score":          score,
                    "rating_comment": rating_comment,
                    "status":         "completed",
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
        year   = request.args.get("pms_year",   active_year)
        period = request.args.get("period", active_period)

        if not user_id:
            return jsonify({"error": "user_id required"}), 400

        mappings_by_obj, _, obj_by_id, cat_by_id = load_scale_meta()

        # Collect all objective IDs whose scale type is "manual"
        manual_obj_ids = [
            obj_id
            for obj_id, mapping in mappings_by_obj.items()
            if mapping.get("scale_type") == "manual"
        ]

        # Find which of those objectives already have a rating saved for this period
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

        # Return only the objectives that still need a rating
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
            .select("id, full_name, designation_id, emp_id, designations!fk_designation(name)")
            .eq("manager_id", evaluator_id)
            .execute()
        )

        if not result.data:
            return jsonify([])

        team     = result.data
        user_ids = [u["id"] for u in team]

        # Fetch template assignments for the whole team in one query
        assign_res = (
            supabase.table("template_assignments")
            .select("user_id, template_id, templates(id, name)")
            .in_("user_id", user_ids)
            .execute()
        )

        # Index assignments by user_id for O(1) lookup during enrichment
        assign_by_user: dict = {}
        for row in assign_res.data or []:
            assign_by_user[row["user_id"]] = {
                "template_id":   row["template_id"],
                "template_name": (
                    row["templates"]["name"] if row.get("templates") else None
                ),
            }

        # Merge template assignment into each team member record
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
    Return the evaluator's profile with an org_context object that describes
    which organisational unit they administer.
    """
    try:
        user_res = (
            supabase.table("users")
            .select(
                "id, full_name, role, email, "
                "designation_id, designations!fk_designation(name), "
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