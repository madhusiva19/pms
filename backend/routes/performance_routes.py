"""
routes/performance.py
----------------------
Flask Blueprint for performance data endpoints.

Endpoints
---------
GET  /api/performance/<user_id>/periods          All periods that have data
GET  /api/performance/<user_id>/<year>/<period>  Full performance breakdown
GET  /api/performance/<user_id>/summary          Period-level score totals
POST /api/sync/actuals                           Upsert raw actual values + recalculate
POST /api/admin/backfill-scores                  Recalculate all scores (admin utility)
"""

from flask import Blueprint, jsonify, request

from services.rating_engine import (
    calculate_rating,
    compute_achievement_pct,
    load_scale_meta,
)
from services.score_service import get_active_period_params, patch_total_score
from utils.db import supabase

performance_bp = Blueprint("my_performance", __name__)


# ---------------------------------------------------------------------------
# Period discovery
# ---------------------------------------------------------------------------

@performance_bp.route("/api/performance/<user_id>/periods", methods=["GET"])
def get_periods(user_id: str):
    """Return a sorted list of unique (year, period) pairs that have records."""
    try:
        result = (
            supabase.table("performance_records")
            .select("period, year")
            .eq("user_id", user_id)
            .execute()
        )

        # Deduplicate in Python — performance_records has one row per objective,
        # so many rows share the same (year, period) key
        seen: set = set()
        periods: list[dict] = []

        for r in result.data:
            key = (r["pms_year"], r["period"])
            if key not in seen:
                seen.add(key)
                periods.append({"pms_year": r["pms_year"], "period": r["period"]})

        periods.sort(key=lambda x: (x["pms_year"], x["period"]))
        return jsonify(periods)

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ---------------------------------------------------------------------------
# Full performance breakdown
# ---------------------------------------------------------------------------

@performance_bp.route(
    "/api/performance/<user_id>/<int:year>/<period>",
    methods=["GET"],
)
def get_performance(user_id: str, year: int, period: str):
    """
    Return a complete performance breakdown for one user/year/period.

    Response shape
    --------------
    {
      employee: { id, name, designation, department },
      period, year, final_score, max_score,
      categories: [
        {
          category_name, category_weight, category_score, max_possible,
          objectives: [ { objective_id, objective_name, weight, rating,
                          score, target, actual, ... } ]
        }
      ]
    }
    """
    try:
        # Fetch employee profile
        user_res = (
            supabase.table("users")
            .select(
                "id, full_name, designation_id, department_id, "
                "designations!fk_designation(name), departments(name)"
            )
            .eq("id", user_id)
            .single()
            .execute()
        )

        if not user_res.data:
            return jsonify({"error": "User not found"}), 404

        user = user_res.data
        emp_data = {
            "id":          user["id"],
            "name":        user.get("full_name", ""),
            "designation": (user.get("designations") or {}).get("name", ""),
            "department":  (user.get("departments")  or {}).get("name", ""),
        }

        # Fetch raw performance records
        records = (
            supabase.table("performance_records")
            .select("*")
            .eq("user_id", user_id)
            .eq("year", year)
            .eq("period", period)
            .execute()
        )

        if not records.data:
            return jsonify(
                {"error": "No performance records found for this period"}
            ), 404

        # Load all scale metadata in a single batch
        mappings_by_obj, rules_by_mapping, obj_by_id, cat_by_id = load_scale_meta()

        # Enrich each record with calculated rating and score
        enriched: list[dict] = []

        for rec in records.data:
            obj_id   = rec["objective_id"]
            obj      = obj_by_id.get(obj_id, {})
            cat      = cat_by_id.get(obj.get("category_id", 0), {})
            mapping  = mappings_by_obj.get(obj_id, {})
            brackets = rules_by_mapping.get(mapping.get("id"), [])
            weight   = float(obj.get("weight", 0))

            # Use stored values when available to avoid re-computing on every request
            stored_rating = rec.get("rating")
            stored_score  = rec.get("score")

            if stored_rating is not None and stored_score is not None:
                rating = float(stored_rating)
                score  = float(stored_score)
            else:
                rating = calculate_rating(rec, mapping, brackets)
                score  = round(rating * (weight / 100), 4)

            achievement_pct = compute_achievement_pct(rec, mapping)

            enriched.append({
                "objective_id":    obj_id,
                "objective_name":  obj.get("name", ""),
                "category_id":     obj.get("category_id"),
                "category_name":   cat.get("name", ""),
                "weight":          weight,
                "control_type":    obj.get("control_type", ""),
                "target":          rec.get("target"),
                "actual":          rec.get("actual"),
                "manual_rating":   rec.get("manual_rating"),
                "rating_comment":  rec.get("rating_comment"),
                "achievement_pct": achievement_pct,
                "rating":          rating,
                "score":           score,
                "scale_type":      mapping.get("scale_type", "manual"),
                "input_type":      mapping.get("input_type"),
                "ll":              mapping.get("ll"),
                "ul":              mapping.get("ul"),
                "log_column":      mapping.get("log_column", ""),
                "notes":           mapping.get("notes", ""),
                "status":          rec.get("status", "approved"),
            })

        # Group enriched records into categories
        cats_map: dict[str, dict] = {}

        for item in enriched:
            cname = item["category_name"]

            if cname not in cats_map:
                cats_map[cname] = {
                    "category_name":   cname,
                    "category_weight": cat_by_id.get(item["category_id"], {}).get("weight", 0),
                    "objectives":      [],
                    "category_score":  0.0,
                    "max_possible":    0.0,
                }

            cats_map[cname]["objectives"].append(item)
            # Accumulate the running score total for this category
            cats_map[cname]["category_score"] = round(
                cats_map[cname]["category_score"] + item["score"], 4
            )
            # max_possible = sum of (weight / 100) × 5 across all objectives in the category
            cats_map[cname]["max_possible"] = round(
                cats_map[cname]["max_possible"] + (item["weight"] / 100) * 5, 4
            )

        category_list = list(cats_map.values())
        # final_score is the sum of all category scores (already weighted by objective weights)
        final_score   = round(sum(c["category_score"] for c in category_list), 4)
        max_score     = round(sum(c["max_possible"]   for c in category_list), 4)

        return jsonify({
            "employee":    emp_data,
            "period":      period,
            "pms_year":        year,
            "final_score": final_score,
            "max_score":   max_score,
            "categories":  category_list,
        })

    except Exception as exc:
        print(f"[ERROR] get_performance: {exc}")
        return jsonify({"error": str(exc)}), 500


# ---------------------------------------------------------------------------
# Score summary
# ---------------------------------------------------------------------------

@performance_bp.route("/api/performance/<user_id>/summary", methods=["GET"])
def get_performance_summary(user_id: str):
    """Return aggregated period scores for a given year (defaults to active year)."""
    try:
        active_year, _ = get_active_period_params()
        year = int(request.args.get("pms_year", active_year))

        records = (
            supabase.table("performance_records")
            .select("period, score")
            .eq("user_id", user_id)
            .eq("year", year)
            .execute()
        )

        periods_map: dict[str, float] = {}
        for r in records.data:
            p = r["period"]
            periods_map.setdefault(p, 0.0)
            periods_map[p] = round(periods_map[p] + float(r.get("score") or 0), 4)

        return jsonify({"pms_year": year, "scores": periods_map})

    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ---------------------------------------------------------------------------
# Sync actuals
# ---------------------------------------------------------------------------

@performance_bp.route("/api/sync/actuals", methods=["POST"])
def sync_actuals():
    """
    Upsert raw actual/target values for non-manual KPIs, recalculate ratings
    and scores, and update the performance_summaries total.
    """
    try:
        body       = request.get_json()
        user_id    = body.get("user_id")
        year       = body.get("pms_year")
        period     = body.get("period")
        records_in = body.get("records", [])

        if not all([user_id, year, period, records_in]):
            return jsonify({"error": "Missing required fields"}), 400

        mappings_by_obj, rules_by_mapping, obj_by_id, _ = load_scale_meta()
        synced = 0

        for entry in records_in:
            obj_id = entry.get("objective_id")
            target = entry.get("target")
            actual = entry.get("actual")

            if not obj_id:
                continue

            obj      = obj_by_id.get(obj_id, {})
            mapping  = mappings_by_obj.get(obj_id, {})
            brackets = rules_by_mapping.get(mapping.get("id"), [])

            # Skip manual KPIs — they are handled through the evaluator flow
            if mapping.get("scale_type") == "manual":
                continue

            # Build a minimal stub record so calculate_rating can derive the rating
            rec_stub = {"actual": actual, "target": target, "manual_rating": None}
            rating   = calculate_rating(rec_stub, mapping, brackets)
            weight   = float(obj.get("weight", 0))
            score    = round(rating * (weight / 100), 4)

            # Upsert so re-syncs overwrite stale values without creating duplicates
            supabase.table("performance_records").upsert(
                {
                    "user_id":       user_id,
                    "objective_id":  obj_id,
                    "period":        period,
                    "year":              year,
                    "target":        target,
                    "actual":        actual,
                    "manual_rating": None,
                    "rating":        rating,
                    "score":         score,
                    "status":        "approved",
                },
                on_conflict="user_id,objective_id,period,year",
            ).execute()

            synced += 1

        total = patch_total_score(user_id, year, period)

        return jsonify({"success": True, "synced": synced, "total_score": total})

    except Exception as exc:
        print(f"[ERROR] sync_actuals: {exc}")
        return jsonify({"error": str(exc)}), 500


# ---------------------------------------------------------------------------
# Admin backfill
# ---------------------------------------------------------------------------

@performance_bp.route("/api/admin/backfill-scores", methods=["POST"])
def backfill_scores():
    """
    Admin utility: recalculate rating and score for every performance_record
    in the database.

    Use this after changing KPI scale parameters or bracket rules to bring
    historical records in sync.
    """
    try:
        mappings_by_obj, rules_by_mapping, obj_by_id, _ = load_scale_meta()

        all_records = (
            supabase.table("performance_records").select("*").execute().data or []
        )

        updated     = 0
        # Collect unique (user, year, period) keys so we can refresh summary totals once per group
        period_keys: set[tuple] = set()

        for rec in all_records:
            obj_id   = rec["objective_id"]
            mapping  = mappings_by_obj.get(obj_id, {})
            brackets = rules_by_mapping.get(mapping.get("id"), [])
            obj      = obj_by_id.get(obj_id, {})
            weight   = float(obj.get("weight", 0))

            # Re-derive rating using current scale parameters (may differ from stored value)
            rating = calculate_rating(rec, mapping, brackets)
            score  = round(rating * (weight / 100), 4)

            supabase.table("performance_records").update(
                {"rating": rating, "score": score}
            ).eq("id", rec["id"]).execute()

            period_keys.add((rec["user_id"], rec["year"], rec["period"]))
            updated += 1

        # Refresh all affected summary rows after all records are updated
        for (uid, yr, per) in period_keys:
            patch_total_score(uid, yr, per)

        return jsonify({
            "success":          True,
            "records_updated":  updated,
            "batches_totalled": len(period_keys),
        })

    except Exception as exc:
        print(f"[ERROR] backfill_scores: {exc}")
        return jsonify({"error": str(exc)}), 500