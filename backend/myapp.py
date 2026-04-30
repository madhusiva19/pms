"""
app.py — PMS Template Management Backend 

"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from supabase import create_client, Client
from datetime import date, datetime, timedelta
from dateutil.relativedelta import relativedelta
import os
from dotenv import load_dotenv

app = Flask(__name__)
CORS(app)

# ── Supabase credentials ──────────────────────────────────────────────────────
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Freeze constants ──────────────────────────────────────────────────────────
OBJECTIVE_SETTING_MONTHS = 12
GRACE_PERIOD_DAYS        = 15
PMS_START_MONTH          = 7
PMS_START_DAY            = 1
DEFAULT_MAX_SCORE        = 5


# ─────────────────────────────────────────────────────────────────────────────
# STARTUP SYNC  ← FIXED
#
# Old behaviour: always overwrote DB dates with constants on every startup.
# New behaviour:
#   1. If the active cycle already has objective_setting_end / grace_period_end
#      in the DB → those are HQ Admin's edited dates, NEVER overwrite them.
#   2. If the active cycle is missing those dates (e.g. newly created row) →
#      calculate from constants and save them once.
#   3. If there is NO active cycle at all → create one from constants.
#   4. If the active cycle's PMS year has ended (grace_end has passed) →
#      auto-create next year's cycle using the SAME date offsets that HQ Admin
#      set (i.e. derive the gap/duration from the old cycle, not from constants).
# ─────────────────────────────────────────────────────────────────────────────

def sync_cycle_dates_from_constants() -> None:
    """
    Called once at startup. Ensures an active PMS cycle exists with valid dates.
    Never overwrites dates that were explicitly edited by HQ Admin.
    """
    try:
        result = (
            supabase.table("pms_cycles")
            .select("*")
            .eq("is_active", True)
            .order("pms_year", desc=True)
            .limit(1)
            .execute()
        )

        # ── No active cycle at all → create one from constants ────────────
        if not result.data:
            _create_cycle_from_constants()
            return

        cycle = result.data[0]

        # ── Active cycle exists — check if dates are already set ──────────
        has_objective_end = bool(cycle.get("objective_setting_end"))
        has_grace_end     = bool(cycle.get("grace_period_end"))

        if has_objective_end and has_grace_end:
            # Dates already exist (either from constants or HQ Admin edits)
            # DO NOT overwrite — respect whatever is in the DB
            print(
                f"✅ sync: cycle {cycle['pms_year']} already has dates "
                f"(objective_end={cycle['objective_setting_end']}, "
                f"grace_end={cycle['grace_period_end']}) — skipping overwrite."
            )
            # But still check if this cycle has expired and we need to roll over
            _maybe_rollover_cycle(cycle)
            return

        # ── Dates are missing → fill them in from constants (first-time setup) ─
        pms_start     = datetime.fromisoformat(cycle["pms_start"]).date()
        objective_end = pms_start + relativedelta(months=OBJECTIVE_SETTING_MONTHS)
        grace_end     = objective_end + timedelta(days=GRACE_PERIOD_DAYS)

        supabase.table("pms_cycles").update({
            "objective_setting_end": objective_end.isoformat(),
            "grace_period_end":      grace_end.isoformat(),
        }).eq("id", cycle["id"]).execute()

        print(
            f"✅ sync: filled missing dates for cycle {cycle['pms_year']} "
            f"→ objective_end={objective_end}, grace_end={grace_end}"
        )

        _maybe_rollover_cycle({**cycle, "objective_setting_end": objective_end.isoformat(), "grace_period_end": grace_end.isoformat()})

    except Exception as error:
        print(f"❌ sync_cycle_dates_from_constants failed: {error}")


def _create_cycle_from_constants() -> None:
    """Creates a fresh active PMS cycle using the hard-coded constants."""
    today     = date.today()
    year      = today.year
    pms_start = date(year, PMS_START_MONTH, PMS_START_DAY)
    if today < pms_start:
        pms_start = date(year - 1, PMS_START_MONTH, PMS_START_DAY)

    objective_end = pms_start + relativedelta(months=OBJECTIVE_SETTING_MONTHS)
    grace_end     = objective_end + timedelta(days=GRACE_PERIOD_DAYS)

    supabase.table("pms_cycles").insert({
        "pms_year":              pms_start.year,
        "pms_start":             pms_start.isoformat(),
        "objective_setting_end": objective_end.isoformat(),
        "grace_period_end":      grace_end.isoformat(),
        "is_active":             True,
        "created_at":            datetime.now().isoformat(),
    }).execute()

    print(f"✅ sync: created new cycle {pms_start.year} from constants.")


def _maybe_rollover_cycle(cycle: dict) -> None:
    """
    If the active cycle's grace period has ended, automatically create the
    next year's cycle using the SAME date offsets that HQ Admin configured
    (not the hard-coded constants), so edited patterns carry forward.
    """
    try:
        grace_end_str = cycle.get("grace_period_end") or cycle.get("grace_end")
        if not grace_end_str:
            return

        grace_end = datetime.fromisoformat(grace_end_str).date()
        today     = date.today()

        if today <= grace_end:
            # Cycle is still active — nothing to do
            return

        # ── Cycle has expired → derive offsets from HQ Admin's edited dates ─
        pms_start     = datetime.fromisoformat(cycle["pms_start"]).date()
        objective_end = datetime.fromisoformat(cycle["objective_setting_end"]).date()

        # Calculate the actual durations HQ Admin set (may differ from constants)
        objective_duration_months = (
            (objective_end.year - pms_start.year) * 12
            + (objective_end.month - pms_start.month)
        )
        grace_duration_days = (grace_end - objective_end).days

        # Next cycle starts exactly one year after the old pms_start
        next_pms_start     = date(pms_start.year + 1, pms_start.month, pms_start.day)
        next_objective_end = next_pms_start + relativedelta(months=objective_duration_months)
        next_grace_end     = next_objective_end + timedelta(days=grace_duration_days)

        # Check if next cycle already exists
        existing = (
            supabase.table("pms_cycles")
            .select("id")
            .eq("pms_year", next_pms_start.year)
            .execute()
        )
        if existing.data:
            print(f"✅ rollover: cycle {next_pms_start.year} already exists — skipping.")
            return

        # Deactivate old cycle and create the new one
        supabase.table("pms_cycles").update({"is_active": False}).eq("id", cycle["id"]).execute()

        supabase.table("pms_cycles").insert({
            "pms_year":              next_pms_start.year,
            "pms_start":             next_pms_start.isoformat(),
            "objective_setting_end": next_objective_end.isoformat(),
            "grace_period_end":      next_grace_end.isoformat(),
            "is_active":             True,
            "created_at":            datetime.now().isoformat(),
        }).execute()

        print(
            f"✅ rollover: auto-created cycle {next_pms_start.year} "
            f"using HQ Admin's offsets "
            f"({objective_duration_months}m objective window, {grace_duration_days}d grace) "
            f"→ objective_end={next_objective_end}, grace_end={next_grace_end}"
        )

    except Exception as error:
        print(f"❌ _maybe_rollover_cycle failed: {error}")


# ─────────────────────────────────────────────────────────────────────────────
# FREEZE HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def get_active_pms_cycle() -> dict | None:
    try:
        result = (
            supabase.table("pms_cycles")
            .select("*")
            .eq("is_active", True)
            .order("pms_year", desc=True)
            .limit(1)
            .execute()
        )
        if result.data:
            return result.data[0]
    except Exception:
        pass
    return None


def compute_freeze_dates_from_cycle(cycle: dict) -> dict:
    pms_start = datetime.fromisoformat(cycle["pms_start"]).date()

    if cycle.get("objective_setting_end"):
        objective_end = datetime.fromisoformat(cycle["objective_setting_end"]).date()
    else:
        objective_end = pms_start + relativedelta(months=OBJECTIVE_SETTING_MONTHS)

    if cycle.get("grace_period_end"):
        grace_end = datetime.fromisoformat(cycle["grace_period_end"]).date()
    else:
        grace_end = objective_end + timedelta(days=GRACE_PERIOD_DAYS)

    return {
        "pms_start":     pms_start,
        "objective_end": objective_end,
        "grace_end":     grace_end,
    }


def compute_freeze_dates_from_constants() -> dict:
    today = date.today()
    year  = today.year

    pms_start = date(year, PMS_START_MONTH, PMS_START_DAY)
    if today < pms_start:
        pms_start = date(year - 1, PMS_START_MONTH, PMS_START_DAY)

    objective_end = pms_start + relativedelta(months=OBJECTIVE_SETTING_MONTHS)
    grace_end     = objective_end + timedelta(days=GRACE_PERIOD_DAYS)
    return {
        "pms_start":     pms_start,
        "objective_end": objective_end,
        "grace_end":     grace_end,
    }


def get_freeze_status() -> str:
    today = date.today()
    cycle = get_active_pms_cycle()
    dates = compute_freeze_dates_from_cycle(cycle) if cycle else compute_freeze_dates_from_constants()

    if today >= dates["grace_end"]:      return "frozen"
    if today >= dates["objective_end"]:  return "grace"
    return "open"


def can_role_edit(level: int) -> bool:
    status = get_freeze_status()
    if status == "frozen":              return False
    if status == "grace" and level > 1: return False
    return True


def get_request_level() -> int:
    return int(request.headers.get("X-User-Level", 1))


# ─────────────────────────────────────────────────────────────────────────────
# PMS CYCLES ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/pms-cycles", methods=["GET"])
def get_pms_cycles():
    try:
        cycles = (
            supabase.table("pms_cycles")
            .select("*")
            .order("pms_year", desc=True)
            .execute()
            .data
        )
        return jsonify(cycles), 200
    except Exception as error:
        return jsonify({"error": str(error)}), 400


@app.route("/pms-cycles/active", methods=["GET"])
def get_active_pms_cycle_route():
    try:
        cycle = get_active_pms_cycle()

        if not cycle:
            dates = compute_freeze_dates_from_constants()
            return jsonify({
                "id":                 None,
                "pms_year":           dates["pms_start"].year,
                "pms_start":          dates["pms_start"].isoformat(),
                "objective_end":      dates["objective_end"].isoformat(),
                "grace_end":          dates["grace_end"].isoformat(),
                "objective_setting_end": dates["objective_end"].isoformat(),
                "grace_period_end":   dates["grace_end"].isoformat(),
                "mid_year_review":    None,
                "year_end_review":    None,
                "is_active":          True,
                "freeze_status":      get_freeze_status(),
                "source":             "constants",
            }), 200

        dates = compute_freeze_dates_from_cycle(cycle)
        return jsonify({
            **cycle,
            "objective_end":         dates["objective_end"].isoformat(),
            "grace_end":             dates["grace_end"].isoformat(),
            "objective_setting_end": dates["objective_end"].isoformat(),
            "grace_period_end":      dates["grace_end"].isoformat(),
            "freeze_status":         get_freeze_status(),
            "source":                "database",
        }), 200
    except Exception as error:
        return jsonify({"error": str(error)}), 400


@app.route("/pms-cycles", methods=["POST"])
def create_pms_cycle():
    try:
        level = get_request_level()
        if level > 1:
            return jsonify({"error": "Only HQ Admin can create PMS cycles."}), 403

        data = request.get_json()
        year = data.get("pms_year")
        if not year:
            return jsonify({"error": "pms_year is required"}), 400

        pms_start     = date(int(year), PMS_START_MONTH, PMS_START_DAY)
        objective_end = pms_start + relativedelta(months=OBJECTIVE_SETTING_MONTHS)
        grace_end     = objective_end + timedelta(days=GRACE_PERIOD_DAYS)

        supabase.table("pms_cycles").update({"is_active": False}).eq("is_active", True).execute()

        result = supabase.table("pms_cycles").insert({
            "pms_year":              int(year),
            "pms_start":             pms_start.isoformat(),
            "objective_setting_end": objective_end.isoformat(),
            "mid_year_review":       data.get("mid_year_review"),
            "year_end_review":       data.get("year_end_review"),
            "grace_period_end":      grace_end.isoformat(),
            "is_active":             True,
            "created_at":            datetime.now().isoformat(),
        }).execute()

        return jsonify(result.data[0]), 200
    except Exception as error:
        return jsonify({"error": str(error)}), 400


@app.route("/pms-cycles/<int:cycle_id>", methods=["PUT"])
def update_pms_cycle(cycle_id):
    try:
        level = get_request_level()
        if level > 1:
            return jsonify({"error": "Only HQ Admin can update PMS cycles."}), 403

        data           = request.get_json()
        update_payload: dict = {}

        if data.get("mid_year_review") is not None:
            update_payload["mid_year_review"] = data["mid_year_review"]
        if data.get("year_end_review") is not None:
            update_payload["year_end_review"] = data["year_end_review"]
        if data.get("grace_period_end"):
            update_payload["grace_period_end"] = data["grace_period_end"]
        if data.get("objective_setting_end"):
            update_payload["objective_setting_end"] = data["objective_setting_end"]

        if update_payload:
            supabase.table("pms_cycles").update(update_payload).eq("id", cycle_id).execute()

        return jsonify({"message": "PMS cycle updated"}), 200
    except Exception as error:
        return jsonify({"error": str(error)}), 400


@app.route("/pms-cycles/close", methods=["POST"])
def close_pms_cycle():
    try:
        level = get_request_level()
        if level > 1:
            return jsonify({"error": "Only HQ Admin can close PMS cycles."}), 403

        cycle = get_active_pms_cycle()
        if not cycle:
            return jsonify({"error": "No active PMS cycle found."}), 404

        supabase.table("pms_cycles").update({"is_active": False}).eq("id", cycle["id"]).execute()
        return jsonify({"message": f"PMS cycle {cycle['pms_year']} closed successfully."}), 200
    except Exception as error:
        return jsonify({"error": str(error)}), 400


@app.route("/pms-cycles/open-next", methods=["POST"])
def open_next_pms_cycle():
    try:
        level = get_request_level()
        if level > 1:
            return jsonify({"error": "Only HQ Admin can open the next PMS cycle."}), 403

        current_cycle = get_active_pms_cycle()
        if current_cycle:
            next_year = int(current_cycle["pms_year"]) + 1
            supabase.table("pms_cycles").update({"is_active": False}).eq("id", current_cycle["id"]).execute()
        else:
            today     = date.today()
            next_year = today.year if today.month < PMS_START_MONTH else today.year + 1

        pms_start     = date(next_year, PMS_START_MONTH, PMS_START_DAY)
        objective_end = pms_start + relativedelta(months=OBJECTIVE_SETTING_MONTHS)
        grace_end     = objective_end + timedelta(days=GRACE_PERIOD_DAYS)

        data = request.get_json() or {}

        result = supabase.table("pms_cycles").insert({
            "pms_year":              next_year,
            "pms_start":             pms_start.isoformat(),
            "objective_setting_end": objective_end.isoformat(),
            "mid_year_review":       data.get("mid_year_review"),
            "year_end_review":       data.get("year_end_review"),
            "grace_period_end":      grace_end.isoformat(),
            "is_active":             True,
            "created_at":            datetime.now().isoformat(),
        }).execute()

        return jsonify({
            "message": f"PMS cycle {next_year} opened successfully.",
            "cycle":   result.data[0],
        }), 200
    except Exception as error:
        return jsonify({"error": str(error)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# BRANCHES ROUTE
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/branches", methods=["GET"])
def get_branches():
    try:
        result = (
            supabase.table("branches")
            .select("id, code, name, country_id")
            .order("name")
            .execute()
        )
        if result.data:
            return jsonify(result.data), 200

        depts = supabase.table("departments").select("branch_id").execute().data
        unique_branch_ids = list(set(
            d["branch_id"] for d in depts if d.get("branch_id")
        ))
        return jsonify([
            {"id": bid, "name": bid, "code": bid, "country_id": None}
            for bid in unique_branch_ids
        ]), 200

    except Exception as error:
        return jsonify({"error": str(error)}), 400


@app.route("/branches", methods=["POST"])
def create_branch():
    try:
        data       = request.get_json()
        code       = data.get("code", "").strip().upper()
        name       = data.get("name", "").strip()
        country_id = data.get("country_id") or None

        if not code:
            return jsonify({"error": "Branch code is required"}), 400
        if not name:
            return jsonify({"error": "Branch name is required"}), 400

        existing = supabase.table("branches").select("id").eq("code", code).execute()
        if existing.data:
            return jsonify({"error": f"A branch with code '{code}' already exists."}), 409

        result = supabase.table("branches").insert({
            "code":       code,
            "name":       name,
            "country_id": country_id,
        }).execute()
        return jsonify(result.data[0]), 200
    except Exception as error:
        return jsonify({"error": str(error)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# TEMPLATE ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/templates", methods=["POST"])
def save_template():
    try:
        data = request.get_json()
        now  = datetime.now().isoformat()

        active_cycle = get_active_pms_cycle()
        cycle_id     = active_cycle["id"] if active_cycle else None

        result = supabase.table("templates").insert({
            "name":             data.get("name"),
            "description":      data.get("description"),
            "max_score":        data.get("max_score", DEFAULT_MAX_SCORE),
            "template_content": data.get("categories"),
            "total_weight":     data.get("totalWeight"),
            "pms_cycle_id":     cycle_id,
            "status":           "active",
            "created_at":       now,
            "lastModified":     now,
            "created_by":       None,
        }).execute()

        return jsonify({
            "message": "Template saved!",
            "id":      result.data[0]["id"],
        }), 200
    except Exception as error:
        return jsonify({"error": str(error)}), 400


@app.route("/templates", methods=["GET"])
def get_templates():
    try:
        templates    = supabase.table("templates").select("*").execute().data
        mapping      = supabase.table("template_assignments").select("*").execute().data
        designations = supabase.table("designations").select("*").execute().data
        departments  = supabase.table("departments").select("*").execute().data
        branches     = supabase.table("branches").select("id, code, name").execute().data
        users        = supabase.table("users").select("id, full_name").execute().data

        for template in templates:
            if "template_content" in template:
                template["categories"] = template.pop("template_content")

            t_id = template["id"]
            t_assignments = [m for m in mapping if m["template_id"] == t_id]

            assigned_designation_ids = list(set(
                m["designation_id"] for m in t_assignments if m.get("designation_id")
            ))
            assigned_dept_ids = list(set(
                str(m["department_id"]) for m in t_assignments if m.get("department_id")
            ))
            assigned_branch_ids = list(set(
                str(m["branch_id"]) for m in t_assignments if m.get("branch_id")
            ))
            assigned_user_ids = list(set(
                str(m["user_id"]) for m in t_assignments if m.get("user_id")
            ))

            template["assignedDesignations"]     = [r["name"] for r in designations if r["id"] in assigned_designation_ids]
            template["assignedDesignationIds"]   = assigned_designation_ids
            template["assignedDepartments"]      = [
                {"id": str(d["id"]), "name": d["name"], "code": d.get("code"), "branch_id": str(d["branch_id"]) if d.get("branch_id") else None}
                for d in departments if str(d["id"]) in assigned_dept_ids
            ]
            template["assignedDepartmentNames"]  = [d["name"] for d in departments if str(d["id"]) in assigned_dept_ids]
            template["assignedDepartmentsIds"]   = assigned_dept_ids
            template["assignedBranches"]         = [
                {"id": str(b["id"]), "name": b["name"], "code": b.get("code")}
                for b in branches if str(b["id"]) in assigned_branch_ids
            ]
            template["assignedBranchIds"]        = assigned_branch_ids
            template["assignedEmployees"]        = [u["full_name"] for u in users if str(u["id"]) in assigned_user_ids]
            template["assignedEmployeeIds"]      = assigned_user_ids
            template["assignedRules"]            = [
                {
                    "designation_id": m.get("designation_id"),
                    "department_id":  str(m["department_id"]) if m.get("department_id") else None,
                    "branch_id":      str(m["branch_id"])     if m.get("branch_id")     else None,
                    "user_id":        str(m["user_id"])       if m.get("user_id")       else None,
                }
                for m in t_assignments
            ]

            if template.get("max_score") is None:
                template["max_score"] = DEFAULT_MAX_SCORE

        return jsonify(templates), 200
    except Exception as error:
        return jsonify({"error": str(error)}), 400


@app.route("/templates/<int:template_id>", methods=["GET"])
def get_single_template(template_id):
    try:
        result = supabase.table("templates").select("*").eq("id", template_id).single().execute()
        if not result.data:
            return jsonify({"error": "Template not found"}), 404

        template = result.data
        if "template_content" in template:
            template["categories"] = template.pop("template_content")
        if template.get("max_score") is None:
            template["max_score"] = DEFAULT_MAX_SCORE
        return jsonify(template), 200
    except Exception as error:
        return jsonify({"error": str(error)}), 400


@app.route("/templates/<int:template_id>", methods=["PUT"])
def update_template(template_id):
    try:
        level = get_request_level()
        if not can_role_edit(level):
            status  = get_freeze_status()
            message = (
                "Templates are fully frozen — no changes permitted until next PMS cycle."
                if status == "frozen"
                else "Only HQ Admin can edit during the grace period."
            )
            return jsonify({"error": message}), 403

        data = request.get_json()
        now  = datetime.now().isoformat()

        update_payload = {
            "name":             data.get("name"),
            "description":      data.get("description"),
            "max_score":        data.get("max_score", DEFAULT_MAX_SCORE),
            "template_content": data.get("categories"),
            "total_weight":     data.get("totalWeight"),
            "lastModified":     now,
        }

        supabase.table("templates").update(update_payload).eq("id", template_id).execute()
        return jsonify({"message": "Template updated successfully"}), 200
    except Exception as error:
        return jsonify({"error": str(error)}), 400


@app.route("/templates/<int:template_id>", methods=["DELETE"])
def delete_template(template_id):
    try:
        level = get_request_level()
        if not can_role_edit(level):
            return jsonify({"error": "Cannot delete — template is frozen or you lack permission."}), 403

        supabase.table("template_assignments").delete().eq("template_id", template_id).execute()
        supabase.table("templates").delete().eq("id", template_id).execute()
        return jsonify({"message": "Template deleted successfully"}), 200
    except Exception as error:
        return jsonify({"error": str(error)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# MY-TEMPLATES ROUTE
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/my-templates", methods=["GET"])
def get_my_templates():
    try:
        user_id_param = request.args.get("user_id", "").strip()
        if not user_id_param:
            return jsonify({"error": "user_id query parameter is required"}), 400

        user_result = (
            supabase.table("users")
            .select("id, full_name, designation_id, department_id, branch_id")
            .eq("id", user_id_param)
            .execute()
        )

        if not user_result.data:
            return jsonify({"error": f"No user found with id '{user_id_param}'."}), 404

        user = user_result.data[0]
        user_pk        = str(user["id"])
        designation_id = int(user["designation_id"]) if user.get("designation_id") else None
        department_id  = str(user["department_id"])  if user.get("department_id")  else None
        branch_id      = str(user["branch_id"])      if user.get("branch_id")      else None

        all_assignments = supabase.table("template_assignments").select("*").execute().data
        matched_template_ids: set = set()

        for a in all_assignments:
            if a.get("user_id") and str(a["user_id"]) == user_pk:
                matched_template_ids.add(a["template_id"])
                continue

            rule_desig  = int(a["designation_id"]) if a.get("designation_id") else None
            rule_dept   = str(a["department_id"])  if a.get("department_id")  else None
            rule_branch = str(a["branch_id"])      if a.get("branch_id")      else None

            if rule_desig is None and rule_dept is None and rule_branch is None:
                continue

            designation_ok = (rule_desig  is None) or (designation_id is not None and rule_desig  == designation_id)
            dept_ok        = (rule_dept   is None) or (department_id  is not None and rule_dept   == department_id)
            branch_ok      = (rule_branch is None) or (branch_id      is not None and rule_branch == branch_id)

            if designation_ok and dept_ok and branch_ok:
                matched_template_ids.add(a["template_id"])

        if not matched_template_ids:
            return jsonify([]), 200

        all_templates = supabase.table("templates").select("*").execute().data
        my_templates  = []
        for t in all_templates:
            if t["id"] in matched_template_ids:
                if "template_content" in t:
                    t["categories"] = t.pop("template_content")
                if t.get("max_score") is None:
                    t["max_score"] = DEFAULT_MAX_SCORE
                my_templates.append(t)

        return jsonify(my_templates), 200

    except Exception as error:
        return jsonify({"error": str(error)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# ASSIGNMENT ROUTES
# ─────────────────────────────────────────────────────────────────────────────

def _do_assign_template():
    try:
        level = get_request_level()
        if not can_role_edit(level):
            return jsonify({"error": "Cannot assign — template is frozen."}), 403

        data        = request.get_json()
        template_id = data.get("template_id")

        if not template_id:
            return jsonify({"error": "template_id is required"}), 400

        supabase.table("template_assignments").delete().eq("template_id", template_id).execute()

        assign_rows: list = []

        if data.get("rules"):
            for rule in data["rules"]:
                row: dict = {"template_id": template_id}
                if rule.get("user_id"):
                    uid = str(rule["user_id"]).strip()
                    u   = supabase.table("users").select("id").eq("id", uid).execute()
                    if not u.data:
                        return jsonify({"error": f"User '{uid}' not found."}), 404
                    row = {"template_id": template_id, "user_id": uid, "designation_id": None, "department_id": None, "branch_id": None}
                else:
                    row = {
                        "template_id":    template_id,
                        "user_id":        None,
                        "designation_id": rule.get("designation_id") or None,
                        "department_id":  rule.get("department_id")  or None,
                        "branch_id":      rule.get("branch_id")      or None,
                    }
                if all(row.get(k) is None for k in ("user_id", "designation_id", "department_id", "branch_id")):
                    continue
                assign_rows.append(row)
        else:
            designation_ids = data.get("designation_ids") or []
            dept_ids        = [str(d) for d in (data.get("department_ids") or []) if d]
            raw_user        = str(data.get("user_id", "")).strip()

            if raw_user:
                u = supabase.table("users").select("id").eq("id", raw_user).execute()
                if not u.data:
                    return jsonify({"error": f"User '{raw_user}' not found."}), 404
                assign_rows.append({"template_id": template_id, "user_id": raw_user, "designation_id": None, "department_id": None, "branch_id": None})

            if not designation_ids and not dept_ids:
                return jsonify({"message": "Template assignments cleared.", "rows_inserted": 0}), 200

            dept_branch_map: dict = {}
            if dept_ids:
                dept_rows = supabase.table("departments").select("id, branch_id").in_("id", dept_ids).execute().data
                for dr in dept_rows:
                    dept_branch_map[str(dr["id"])] = str(dr["branch_id"]) if dr.get("branch_id") else None

            if dept_ids and designation_ids:
                for desig_id in designation_ids:
                    for did in dept_ids:
                        assign_rows.append({"template_id": template_id, "designation_id": desig_id, "department_id": did, "branch_id": dept_branch_map.get(did), "user_id": None})
            elif designation_ids:
                for desig_id in designation_ids:
                    assign_rows.append({"template_id": template_id, "designation_id": desig_id, "department_id": None, "branch_id": None, "user_id": None})
            elif dept_ids:
                for did in dept_ids:
                    assign_rows.append({"template_id": template_id, "designation_id": None, "department_id": did, "branch_id": dept_branch_map.get(did), "user_id": None})

        if assign_rows:
            supabase.table("template_assignments").insert(assign_rows).execute()

        direct_users = sum(1 for r in assign_rows if r.get("user_id"))
        rule_rows    = len(assign_rows) - direct_users
        parts        = []
        if direct_users: parts.append(f"{direct_users} direct user(s)")
        if rule_rows:    parts.append(f"{rule_rows} designation/dept rule(s)")

        return jsonify({"message": f"Template assigned: {', '.join(parts) or 'no rules'}.", "rows_inserted": len(assign_rows)}), 200

    except Exception as error:
        return jsonify({"error": str(error)}), 400


@app.route("/assign-template", methods=["POST"])
def assign_template():
    return _do_assign_template()


@app.route("/assign-template", methods=["PUT"])
def update_template_assignment():
    return _do_assign_template()


# ─────────────────────────────────────────────────────────────────────────────
# ROLE / DEPARTMENT / USER ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/designations", methods=["GET"])
def get_designations():
    try:
        return jsonify(supabase.table("designations").select("*").execute().data), 200
    except Exception as error:
        return jsonify({"error": str(error)}), 400


@app.route("/designations", methods=["POST"])
def add_designation():
    try:
        name = request.json.get("name")
        if not name:
            return jsonify({"error": "Name required"}), 400
        result = supabase.table("designations").insert({"name": name}).execute()
        return jsonify(result.data[0]), 200
    except Exception as error:
        return jsonify({"error": str(error)}), 400


@app.route("/departments", methods=["GET"])
def get_departments():
    try:
        branch_filter = request.args.get("branch_id", "").strip()
        query = supabase.table("departments").select("id, name, code, branch_id").order("name")
        if branch_filter:
            query = query.eq("branch_id", branch_filter)
        return jsonify(query.execute().data), 200
    except Exception as error:
        return jsonify({"error": str(error)}), 400


@app.route("/departments", methods=["POST"])
def add_department():
    try:
        data      = request.get_json()
        name      = data.get("name", "").strip()
        code      = data.get("code", "").strip().upper()
        branch_id = data.get("branch_id") or None

        if not name:
            return jsonify({"error": "Department name is required"}), 400
        if not code:
            return jsonify({"error": "Department code is required"}), 400

        existing_query = supabase.table("departments").select("id").eq("code", code)
        if branch_id:
            existing_query = existing_query.eq("branch_id", branch_id)
        existing = existing_query.execute()
        if existing.data:
            return jsonify({"error": f"A department with code '{code}' already exists{' in this branch' if branch_id else ''}."}), 409

        result = supabase.table("departments").insert({"name": name, "code": code, "branch_id": branch_id}).execute()
        return jsonify(result.data[0]), 200
    except Exception as error:
        return jsonify({"error": str(error)}), 400


@app.route("/users", methods=["GET"])
def get_users():
    try:
        return jsonify(supabase.table("users").select("id, full_name, branch_id, department_id, designation_id").execute().data), 200
    except Exception as error:
        return jsonify({"error": str(error)}), 400


@app.route("/sync-user", methods=["POST"])
def sync_user():
    try:
        data      = request.get_json()
        user_id   = data.get("user_id", "").strip()
        email     = data.get("email", "")
        full_name = data.get("full_name") or email

        if not user_id:
            return jsonify({"error": "user_id is required"}), 400

        existing = supabase.table("users").select("id").eq("id", user_id).execute()
        if existing.data:
            return jsonify({"message": "User already exists", "synced": False}), 200

        supabase.table("users").insert({"id": user_id, "email": email, "full_name": full_name}).execute()
        return jsonify({"message": "User synced successfully", "synced": True}), 200
    except Exception as error:
        return jsonify({"error": str(error)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# DEBUG ROUTE
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/debug-user/<user_id>", methods=["GET"])
def debug_user(user_id):
    try:
        user = supabase.table("users").select("id, full_name, designation_id, department_id, branch_id").eq("id", user_id).execute().data
        if not user:
            return jsonify({"error": "user not found"}), 404

        assignments = supabase.table("template_assignments").select("*").execute().data
        u           = user[0]
        designation_id = int(u["designation_id"]) if u.get("designation_id") else None
        dept_id        = str(u["department_id"])  if u.get("department_id")  else None
        branch_id      = str(u["branch_id"])      if u.get("branch_id")      else None

        matches = []
        for a in assignments:
            a_desig  = int(a["designation_id"]) if a.get("designation_id") else None
            a_dept   = str(a["department_id"])  if a.get("department_id")  else None
            a_branch = str(a["branch_id"])      if a.get("branch_id")      else None
            a_user   = str(a["user_id"])        if a.get("user_id")        else None

            matched_by = []
            if a_user and a_user == str(u["id"]):
                matched_by.append("direct_user")
            else:
                if a_desig is None and a_dept is None and a_branch is None:
                    pass
                else:
                    designation_ok = (a_desig  is None) or (designation_id is not None and a_desig  == designation_id)
                    dept_ok        = (a_dept   is None) or (dept_id        is not None and a_dept   == dept_id)
                    branch_ok      = (a_branch is None) or (branch_id      is not None and a_branch == branch_id)
                    if designation_ok and dept_ok and branch_ok:
                        matched_by.append(f"rule(desig={a_desig},dept={a_dept},branch={a_branch})")

            if matched_by:
                matches.append({"template_id": a["template_id"], "matched_by": matched_by, "assignment": a})

        return jsonify({
            "user": {"id": str(u["id"]), "full_name": u["full_name"], "designation_id": designation_id, "dept_id": dept_id, "branch_id": branch_id},
            "total_assignments": len(assignments),
            "matched_templates": matches,
            "all_assignments_sample": assignments[:10],
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    sync_cycle_dates_from_constants()
    app.run(debug=True, port=5000)