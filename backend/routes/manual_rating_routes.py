"""
routes/manual_rating.py
------------------------
Flask Blueprint for manual rating data retrieval.

Endpoints
---------
GET /api/manual-objectives/<user_id>            Manual KPIs for a user in a given period
GET /api/feedback/<user_id>/<year>/<period>     Supervisor feedback for the period
GET /api/recommendations/<user_id>/<year>/<p>  AI recommendations for the period
"""

from flask import Blueprint, jsonify, request

from services.score_service import get_active_period_params
from utils.db import supabase

manual_rating_bp = Blueprint("manual_rating", __name__)


# ---------------------------------------------------------------------------
# Manual objectives for a user
# ---------------------------------------------------------------------------

@manual_rating_bp.route("/api/manual-objectives/<user_id>", methods=["GET"])
def get_manual_objectives(user_id: str):
    """
    Return all manual KPI objectives assigned to a user for a given period,
    pre-populated with any ratings already saved.
    """
    try:
        active_year, active_period = get_active_period_params()
        year   = request.args.get("pms_year",   active_year, type=int)
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
# Supervisor feedback
# ---------------------------------------------------------------------------

@manual_rating_bp.route(
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
                "users!evaluations_evaluator_id_fkey(full_name, designation_id, designations!fk_designation(name))"
            )
            .eq("employee_id", user_id)
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

@manual_rating_bp.route(
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