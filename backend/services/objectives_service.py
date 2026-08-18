"""Objectives service — wires the evaluate-member page to the real DB tables.

Full join chain
───────────────
team_members.id  (URL param)
  └─ team_members.user_id  (UUID)
        ├─ performance_records.user_id
        │     └─ performance_records.objective_id
        │           └─ objectives.id
        │                 └─ objectives.category_id → categories.id  (row grouping)
        ├─ performance_summaries.user_id  → total_score, period
        └─ evaluations.employee_id        → overall_score, admin_recommendation

No performance_records yet (template preview path)
────────────────────────────────────────────────────
team_members.user_id  (UUID)
  └─ template_assignments.user_id → template_assignments.template_id
        (direct match; else fall back to a role/org-unit match on
         designation_id + department_id + branch_id + country_id)
        (when a match yields more than one template_id — e.g. one per
         PMS cycle — prefer the one whose templates.pms_cycle_id is
         pms_cycles.is_active; otherwise treat as unassigned)
  └─ templates.id
        └─ categories.template_id → categories.id
              └─ objectives.category_id  (scoped objective list)

NOT templates.template_content — that jsonb column only has objective
*names*, no ids, so it can't be joined; categories.template_id already
does the same scoping as a real FK.

Column sources
──────────────
  OBJECTIVE  ← objectives.name
  WEIGHT     ← performance_records.weight   else  objectives.weight
  TARGET     ← performance_records.target
  ACTUAL     ← performance_records.actual
  ACHIEVE %  ← performance_records.achievement_percentage
               else computed: round(actual / target * 100, 2)
  RATING     ← performance_records.manual_rating  →  rating  →  score

  Overall Score badge ← performance_summaries.total_score
                        else  evaluations.overall_score
                        else  team_members.overall_score
  Period              ← performance_summaries.period
                        else  evaluations.period
  Feedback textarea   ← evaluations.admin_recommendation
"""

from flask import jsonify, request

from .common import USE_SUPABASE, fallback_response, fetch_rows, raw_supabase_request

# ─────────────────────────────────────────────────────────────────────────────
# PostgREST embedded-resource selector for performance_records join
# ─────────────────────────────────────────────────────────────────────────────
_PERF_SELECT = (
    "id,user_id,team_member_id,objective_id,"
    "actual,target,weight,achievement_percentage,"
    "manual_rating,rating,score,"
    "period,year,status,rating_comment,"
    "objectives(id,name,weight,max_score,kpi_scale,control_type,"
    "categories(id,name))"
)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _first(*values):
    """Return the first value that is neither None nor an empty string."""
    for v in values:
        if v is not None and str(v).strip() != "":
            return v
    return None


def _dash(value):
    """Return the value itself, or '-' when it is absent."""
    return value if value is not None else "-"


def _compute_achieve(actual, target, stored):
    """Return achievement_percentage — stored value wins, else compute."""
    if stored is not None:
        return stored
    try:
        t = float(target)
        a = float(actual)
        return round((a / t) * 100, 2) if t != 0 else None
    except (TypeError, ValueError):
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Item builders
# ─────────────────────────────────────────────────────────────────────────────

def _item_from_record(rec):
    """One table row from performance_records (with embedded objectives/categories)."""
    obj = rec.get("objectives") or {}
    cat_block = obj.get("categories") or {} if isinstance(obj, dict) else {}
    category = (
        cat_block.get("name") if isinstance(cat_block, dict) else None
    ) or f"Category {obj.get('category_id', '')}"

    target  = rec.get("target")
    actual  = rec.get("actual")
    weight  = _first(rec.get("weight"), obj.get("weight"))
    rating  = _first(rec.get("manual_rating"), rec.get("rating"), rec.get("score"))
    achieve = _compute_achieve(actual, target, rec.get("achievement_percentage"))

    return category, {
        # ── Table columns ──────────────────────────────
        "name":    obj.get("name") or "Objective",
        "weight":  str(weight) if weight is not None else "-",
        "target":  _dash(target),
        "actual":  _dash(actual),
        "achieve": _dash(achieve),
        "rating":  _dash(rating),
        # ── Extra context (available to UI) ────────────
        "max_score":      obj.get("max_score"),
        "control_type":   obj.get("control_type"),
        "kpi_scale":      obj.get("kpi_scale"),
        "rating_comment": rec.get("rating_comment"),
        "status":         rec.get("status"),
        "period":         rec.get("period"),
        "year":           rec.get("year"),
    }


def _item_from_objective(obj):
    """Fallback: one objectives row when no performance record exists yet."""
    cat_block = obj.get("categories") or {} if isinstance(obj, dict) else {}
    category = (
        cat_block.get("name") if isinstance(cat_block, dict) else None
    ) or f"Category {obj.get('category_id', '')}"

    return category, {
        "name":         obj.get("name") or "Objective",
        "weight":       str(obj.get("weight")) if obj.get("weight") is not None else "-",
        "target":       "-",
        "actual":       "-",
        "achieve":      "-",
        "rating":       "-",
        "max_score":    obj.get("max_score"),
        "control_type": obj.get("control_type"),
        "kpi_scale":    obj.get("kpi_scale"),
        "rating_comment": None,
        "status":       None,
        "period":       None,
        "year":         None,
    }


def _rows_to_groups(rows, item_fn):
    groups: dict[str, list] = {}
    for row in rows:
        category, item = item_fn(row)
        groups.setdefault(category, [])
        groups[category].append(item)
    return [{"category": cat, "items": items} for cat, items in groups.items()]


# ─────────────────────────────────────────────────────────────────────────────
# DB fetchers
# ─────────────────────────────────────────────────────────────────────────────

def _fetch_records(user_id=None, team_member_id=None):
    """performance_records joined with objectives + categories, filtered by member."""
    params = {"select": _PERF_SELECT, "limit": 500}
    if user_id:
        rows = fetch_rows("performance_records", params={**params, "user_id": f"eq.{user_id}"})
        if rows:
            return rows
    if team_member_id:
        rows = fetch_rows("performance_records", params={**params, "team_member_id": f"eq.{team_member_id}"})
        if rows:
            return rows
    return []


def _pick_active_template(template_ids):
    """When a match resolves to more than one template_id (e.g. one per PMS cycle),
    prefer the one tied to the currently active pms_cycles row. Returns None when it
    can't be disambiguated (better to show "no template" than the wrong template).
    """
    template_ids = list(template_ids)
    if len(template_ids) == 1:
        return template_ids[0]
    if not template_ids:
        return None

    templates = fetch_rows("templates", params={
        "select": "id,pms_cycle_id",
        "id": f"in.({','.join(str(t) for t in template_ids)})",
    })
    cycle_ids = {t["pms_cycle_id"] for t in templates if t.get("pms_cycle_id") is not None}
    if not cycle_ids:
        return None

    active_cycles = fetch_rows("pms_cycles", params={
        "select": "id",
        "id": f"in.({','.join(str(c) for c in cycle_ids)})",
        "is_active": "eq.true",
    })
    active_cycle_ids = {c["id"] for c in active_cycles}
    matches = [t["id"] for t in templates if t.get("pms_cycle_id") in active_cycle_ids]
    return matches[0] if len(matches) == 1 else None


def _resolve_template_id(user_id):
    """Find the template assigned to a user: direct assignment first, then a
    role/org-unit match (designation_id + department_id + branch_id + country_id)
    when no direct row exists. Returns None when nothing can be resolved.
    """
    if not user_id:
        return None

    direct = fetch_rows("template_assignments", params={
        "select": "template_id",
        "user_id": f"eq.{user_id}",
    })
    if direct:
        return _pick_active_template({d["template_id"] for d in direct})

    user_rows = fetch_rows("users", params={
        "select": "designation_id,department_id,branch_id,country_id",
        "id": f"eq.{user_id}",
    })
    if not user_rows:
        return None
    user = user_rows[0]
    if any(user.get(f) is None for f in ("designation_id", "department_id", "branch_id", "country_id")):
        return None

    fallback = fetch_rows("template_assignments", params={
        "select": "template_id",
        "designation_id": f"eq.{user['designation_id']}",
        "department_id": f"eq.{user['department_id']}",
        "branch_id": f"eq.{user['branch_id']}",
        "country_id": f"eq.{user['country_id']}",
    })
    if not fallback:
        return None
    return _pick_active_template({f["template_id"] for f in fallback})


def _fetch_objectives_structure(user_id=None):
    """Objectives scoped to the member's assigned template, via categories.template_id
    → objectives.category_id (an exact FK join, not the name-matched template_content
    jsonb). Returns [] when no template can be resolved for this user.
    """
    template_id = _resolve_template_id(user_id)
    if not template_id:
        return []
    try:
        categories = raw_supabase_request("categories", params={
            "select": "id",
            "template_id": f"eq.{template_id}",
        }) or []
        category_ids = [c["id"] for c in categories]
        if not category_ids:
            return []
        return raw_supabase_request(
            "objectives",
            params={
                "select": "*,categories(id,name)",
                "category_id": f"in.({','.join(str(c) for c in category_ids)})",
                "order": "id.asc",
            },
        ) or []
    except Exception:
        return []


def _fetch_summary(user_id):
    """performance_summaries → { total_score, period, year }."""
    empty = {"total_score": None, "period": None, "year": None}
    if not user_id:
        return empty
    try:
        rows = fetch_rows(
            "performance_summaries",
            params={
                "select": "total_score,period,pms_year",
                "user_id": f"eq.{user_id}",
                "order": "pms_year.desc",
                "limit": 1,
            },
        )
    except Exception:
        return empty
    if not rows:
        return empty
    r = rows[0]
    return {"total_score": r.get("total_score"), "period": r.get("period"), "year": r.get("pms_year")}


def _fetch_evaluation(user_id=None, team_member_id=None):
    """evaluations → { id, overall_score, period, year, status, feedback }.

    Used as fallback for overall score / period and to pre-fill the
    admin_recommendation (feedback) textarea.
    """
    empty = {"id": None, "overall_score": None, "period": None, "year": None,
             "status": None, "feedback": None}
    try:
        rows = None
        if user_id:
            rows = fetch_rows(
                "evaluations",
                params={
                    "select": "id,overall_score,period,year,status,admin_recommendation",
                    "employee_id": f"eq.{user_id}",
                    "order": "year.desc,id.desc",
                    "limit": 1,
                },
            )
        if not rows and team_member_id:
            rows = fetch_rows(
                "evaluations",
                params={
                    "select": "id,overall_score,period,year,status,admin_recommendation",
                    "team_member_id": f"eq.{team_member_id}",
                    "order": "year.desc,id.desc",
                    "limit": 1,
                },
            )
        if not rows:
            return empty
        r = rows[0]
        return {
            "id":            r.get("id"),
            "overall_score": r.get("overall_score"),
            "period":        r.get("period"),
            "year":          r.get("year"),
            "status":        r.get("status"),
            "feedback":      r.get("admin_recommendation"),
        }
    except Exception:
        return empty


# ─────────────────────────────────────────────────────────────────────────────
# Route handler
# ─────────────────────────────────────────────────────────────────────────────

def get_objectives():
    """GET /api/objectives

    Query params:
      user_id         — UUID  → team_members.user_id = users.id
      team_member_id  — bigint → team_members.id

    Response:
    {
      "groups": [
        {
          "category": "Financial Focus",
          "items": [
            {
              "name":    "Revenue Achievement",   ← objectives.name
              "weight":  "0.1",                  ← perf_rec.weight || obj.weight
              "target":  "4910.7",               ← perf_rec.target
              "actual":  "4863.1",               ← perf_rec.actual
              "achieve": "99.03",                ← perf_rec.achievement_percentage
                                                    or computed (actual/target*100)
              "rating":  "2.81",                 ← manual_rating → rating → score
              ...
            }
          ]
        }
      ],
      "summary": {
        "total_score": 3.24,                     ← performance_summaries.total_score
        "period":      "Annual Performance 2024", ← performance_summaries.period
        "year":        2024
      },
      "evaluation": {
        "id":            1,
        "overall_score": 3.24,                   ← evaluations.overall_score (fallback)
        "period":        "Annual Performance 2024",
        "year":          2024,
        "status":        "submitted",
        "feedback":      "..."                   ← evaluations.admin_recommendation
      }
    }
    """
    if not USE_SUPABASE:
        return fallback_response({
            "groups": [],
            "summary": {"total_score": None, "period": None, "year": None},
            "evaluation": {"id": None, "overall_score": None, "period": None,
                           "year": None, "status": None, "feedback": None},
            "template_assigned": False,
        })

    user_id        = request.args.get("user_id")
    team_member_id = request.args.get("team_member_id") or request.args.get("member_id")

    # 1. Performance records (primary data source for all 6 table columns)
    records = _fetch_records(user_id=user_id, team_member_id=team_member_id)
    if records:
        groups = _rows_to_groups(records, _item_from_record)
        template_assigned = True
    else:
        # No records yet — show the objectives structure with "-" for data columns
        objectives = _fetch_objectives_structure(user_id)
        groups = _rows_to_groups(objectives, _item_from_objective)
        template_assigned = bool(objectives)

    # 2. Overall score + period from performance_summaries
    summary = _fetch_summary(user_id=user_id)

    # 3. Existing evaluation row (fallback score/period + feedback textarea seed)
    evaluation = _fetch_evaluation(user_id=user_id, team_member_id=team_member_id)

    return jsonify({
        "groups": groups,
        "summary": summary,
        "evaluation": evaluation,
        "template_assigned": template_assigned,
    }), 200
