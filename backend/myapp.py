"""
app.py — PMS Template Management Backend
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from supabase import create_client, Client
from datetime import date, datetime, timedelta
from dateutil.relativedelta import relativedelta
from notification_routes import notifications_bp, init_notifications, start_scheduler
from datetime import datetime, timezone
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import os
from dotenv import load_dotenv

app = Flask(__name__)
app.register_blueprint(notifications_bp)

CORS(app)

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
init_notifications(supabase)


OBJECTIVE_SETTING_MONTHS = 12
GRACE_PERIOD_DAYS        = 15
PMS_START_MONTH          = 7
PMS_START_DAY            = 1
DEFAULT_MAX_SCORE        = 5

# Known admin designation IDs
DESIGNATION_CA  = 1   # Country Admin
DESIGNATION_BA  = 2   # Branch Admin
DESIGNATION_DA  = 3   # Dept Admin
DESIGNATION_SDA = 4   # Sub-Dept Admin


# ─────────────────────────────────────────────────────────────────────────────
# STARTUP SYNC
# ─────────────────────────────────────────────────────────────────────────────

def fix_duplicate_active_cycles() -> None:
    """
    Ensures only ONE active cycle exists.
    If multiple rows have is_active=True, keeps the one with the highest pms_year
    (and highest id as tiebreaker) and deactivates the rest.
    Called once at startup before anything else.
    """
    try:
        result = (
            supabase.table("pms_cycles")
            .select("*")
            .eq("is_active", True)
            .order("pms_year", desc=True)
            .execute()
        )
        active_cycles = result.data or []

        if len(active_cycles) <= 1:
            return  # Nothing to fix

        keep   = active_cycles[0]
        to_fix = [c["id"] for c in active_cycles[1:]]

        supabase.table("pms_cycles").update({"is_active": False}).in_("id", to_fix).execute()
        print(
            f"⚠️  fix_duplicate_active_cycles: deactivated {len(to_fix)} duplicate(s) "
            f"(ids={to_fix}), keeping cycle id={keep['id']} year={keep['pms_year']}"
        )
    except Exception as error:
        print(f"❌ fix_duplicate_active_cycles failed: {error}")


def sync_cycle_dates_from_constants() -> None:
    try:
        result = (
            supabase.table("pms_cycles")
            .select("*")
            .eq("is_active", True)
            .order("pms_year", desc=True)
            .limit(1)
            .execute()
        )

        if not result.data:
            _create_cycle_from_constants()
            return

        cycle = result.data[0]
        has_objective_end = bool(cycle.get("objective_setting_end"))
        has_grace_end     = bool(cycle.get("grace_period_end"))

        if has_objective_end and has_grace_end:
            print(f"✅ sync: cycle {cycle['pms_year']} already has dates — skipping overwrite.")
            _maybe_rollover_cycle(cycle)
            return

        pms_start     = datetime.fromisoformat(cycle["pms_start"]).date()
        objective_end = pms_start + relativedelta(months=OBJECTIVE_SETTING_MONTHS)
        grace_end     = objective_end + timedelta(days=GRACE_PERIOD_DAYS)

        supabase.table("pms_cycles").update({
            "objective_setting_end": objective_end.isoformat(),
            "grace_period_end":      grace_end.isoformat(),
        }).eq("id", cycle["id"]).execute()

        _maybe_rollover_cycle({
            **cycle,
            "objective_setting_end": objective_end.isoformat(),
            "grace_period_end":      grace_end.isoformat(),
        })

    except Exception as error:
        print(f"❌ sync_cycle_dates_from_constants failed: {error}")


def _create_cycle_from_constants() -> None:
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
    Only rolls over if today is STRICTLY AFTER grace_end.
    Added extra safety: will never roll over if objective_setting_end is in the future.
    """
    try:
        grace_end_str = cycle.get("grace_period_end") or cycle.get("grace_end")
        if not grace_end_str:
            return

        grace_end = datetime.fromisoformat(grace_end_str).date()
        today     = date.today()

        obj_end_str = cycle.get("objective_setting_end")
        if obj_end_str:
            obj_end = datetime.fromisoformat(obj_end_str).date()
            if today <= obj_end:
                print(f"✅ _maybe_rollover_cycle: objective window still open until {obj_end} — no rollover.")
                return

        if today <= grace_end:
            print(f"✅ _maybe_rollover_cycle: grace period still active until {grace_end} — no rollover.")
            return

        pms_start     = datetime.fromisoformat(cycle["pms_start"]).date()
        objective_end = datetime.fromisoformat(cycle["objective_setting_end"]).date()

        obj_months  = (objective_end.year - pms_start.year) * 12 + (objective_end.month - pms_start.month)
        grace_days  = (grace_end - objective_end).days

        next_start     = date(pms_start.year + 1, pms_start.month, pms_start.day)
        next_obj_end   = next_start + relativedelta(months=obj_months)
        next_grace_end = next_obj_end + timedelta(days=grace_days)

        existing = supabase.table("pms_cycles").select("id").eq("pms_year", next_start.year).execute()
        if existing.data:
            print(f"✅ _maybe_rollover_cycle: cycle {next_start.year} already exists — no rollover.")
            return

        supabase.table("pms_cycles").update({"is_active": False}).eq("id", cycle["id"]).execute()
        supabase.table("pms_cycles").insert({
            "pms_year":              next_start.year,
            "pms_start":             next_start.isoformat(),
            "objective_setting_end": next_obj_end.isoformat(),
            "grace_period_end":      next_grace_end.isoformat(),
            "is_active":             True,
            "created_at":            datetime.now().isoformat(),
        }).execute()
        print(f"✅ rollover: created cycle {next_start.year}")

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
    objective_end = (
        datetime.fromisoformat(cycle["objective_setting_end"]).date()
        if cycle.get("objective_setting_end")
        else pms_start + relativedelta(months=OBJECTIVE_SETTING_MONTHS)
    )
    grace_end = (
        datetime.fromisoformat(cycle["grace_period_end"]).date()
        if cycle.get("grace_period_end")
        else objective_end + timedelta(days=GRACE_PERIOD_DAYS)
    )
    return {"pms_start": pms_start, "objective_end": objective_end, "grace_end": grace_end}


def compute_freeze_dates_from_constants() -> dict:
    today     = date.today()
    pms_start = date(today.year, PMS_START_MONTH, PMS_START_DAY)
    if today < pms_start:
        pms_start = date(today.year - 1, PMS_START_MONTH, PMS_START_DAY)
    objective_end = pms_start + relativedelta(months=OBJECTIVE_SETTING_MONTHS)
    grace_end     = objective_end + timedelta(days=GRACE_PERIOD_DAYS)
    return {"pms_start": pms_start, "objective_end": objective_end, "grace_end": grace_end}


def get_freeze_status() -> str:
    """Returns the freeze status of the ACTIVE cycle only."""
    today = date.today()
    cycle = get_active_pms_cycle()
    dates = compute_freeze_dates_from_cycle(cycle) if cycle else compute_freeze_dates_from_constants()
    if today >= dates["grace_end"]:     return "frozen"
    if today >= dates["objective_end"]: return "grace"
    return "open"


def can_role_edit(level: int) -> bool:
    status = get_freeze_status()
    if status == "frozen":               return False
    if status == "grace" and level > 1:  return False
    return True


def get_request_level() -> int:
    return int(request.headers.get("X-User-Level", 1))


# ─────────────────────────────────────────────────────────────────────────────
# PER-TEMPLATE PAST-CYCLE GUARD
# ─────────────────────────────────────────────────────────────────────────────

def is_template_from_past_cycle(template_id: int) -> bool:
    try:
        result = (
            supabase.table("templates")
            .select("pms_cycle_id")
            .eq("id", template_id)
            .single()
            .execute()
        )
        if not result.data:
            return False
        t_cycle_id = result.data.get("pms_cycle_id")
        if not t_cycle_id:
            return False
        active = get_active_pms_cycle()
        if not active:
            return False
        return int(t_cycle_id) != int(active["id"])
    except Exception:
        return False


def get_template_freeze_status(t_cycle_id, active_cycle_id: int | None) -> str:
    if t_cycle_id and active_cycle_id and int(t_cycle_id) != int(active_cycle_id):
        return "frozen"
    return get_freeze_status()


# ─────────────────────────────────────────────────────────────────────────────
# DEBUG ROUTE
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/debug-freeze", methods=["GET"])
def debug_freeze():
    try:
        today = date.today()
        cycle = get_active_pms_cycle()

        if not cycle:
            dates = compute_freeze_dates_from_constants()
            return jsonify({
                "today":         str(today),
                "cycle":         None,
                "source":        "constants",
                "pms_start":     str(dates["pms_start"]),
                "objective_end": str(dates["objective_end"]),
                "grace_end":     str(dates["grace_end"]),
                "today_gte_grace_end":  today >= dates["grace_end"],
                "today_gte_obj_end":    today >= dates["objective_end"],
                "freeze_status": get_freeze_status(),
            }), 200

        dates = compute_freeze_dates_from_cycle(cycle)

        all_active = (
            supabase.table("pms_cycles")
            .select("id, pms_year, objective_setting_end, grace_period_end, is_active")
            .eq("is_active", True)
            .execute()
            .data
        )

        return jsonify({
            "today":                     str(today),
            "source":                    "database",
            "active_cycle_id":           cycle["id"],
            "active_cycle_year":         cycle["pms_year"],
            "raw_objective_setting_end": cycle.get("objective_setting_end"),
            "raw_grace_period_end":      cycle.get("grace_period_end"),
            "computed_pms_start":        str(dates["pms_start"]),
            "computed_objective_end":    str(dates["objective_end"]),
            "computed_grace_end":        str(dates["grace_end"]),
            "today_gte_grace_end":       today >= dates["grace_end"],
            "today_gte_objective_end":   today >= dates["objective_end"],
            "freeze_status":             get_freeze_status(),
            "all_active_cycles_count":   len(all_active),
            "all_active_cycles":         all_active,
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────────────────────────────────────
# PMS CYCLES ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/pms-cycles", methods=["GET"])
def get_pms_cycles():
    try:
        cycles = supabase.table("pms_cycles").select("*").order("pms_year", desc=True).execute().data
        return jsonify(cycles), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/pms-cycles/active", methods=["GET"])
def get_active_pms_cycle_route():
    try:
        cycle = get_active_pms_cycle()
        if not cycle:
            dates = compute_freeze_dates_from_constants()
            return jsonify({
                "id": None, "pms_year": dates["pms_start"].year,
                "pms_start":             dates["pms_start"].isoformat(),
                "objective_end":         dates["objective_end"].isoformat(),
                "grace_end":             dates["grace_end"].isoformat(),
                "objective_setting_end": dates["objective_end"].isoformat(),
                "grace_period_end":      dates["grace_end"].isoformat(),
                "mid_year_review": None, "year_end_review": None,
                "is_active": True, "freeze_status": get_freeze_status(), "source": "constants",
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
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/pms-cycles/<int:cycle_id>", methods=["PUT"])
def update_pms_cycle(cycle_id):
    try:
        if get_request_level() > 1:
            return jsonify({"error": "Only HQ Admin can update PMS cycles."}), 403
        data           = request.get_json()
        update_payload = {}
        for field in ["mid_year_review", "year_end_review", "grace_period_end", "objective_setting_end"]:
            if data.get(field):
                update_payload[field] = data[field]
        if update_payload:
            supabase.table("pms_cycles").update(update_payload).eq("id", cycle_id).execute()
        return jsonify({"message": "PMS cycle updated"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/pms-cycles", methods=["POST"])
def create_pms_cycle():
    try:
        if get_request_level() > 1:
            return jsonify({"error": "Only HQ Admin can create PMS cycles."}), 403
        data  = request.get_json()
        year  = data.get("pms_year")
        if not year:
            return jsonify({"error": "pms_year is required"}), 400
        pms_start     = date(int(year), PMS_START_MONTH, PMS_START_DAY)
        objective_end = pms_start + relativedelta(months=OBJECTIVE_SETTING_MONTHS)
        grace_end     = objective_end + timedelta(days=GRACE_PERIOD_DAYS)
        supabase.table("pms_cycles").update({"is_active": False}).eq("is_active", True).execute()
        result = supabase.table("pms_cycles").insert({
            "pms_year": int(year), "pms_start": pms_start.isoformat(),
            "objective_setting_end": objective_end.isoformat(),
            "grace_period_end": grace_end.isoformat(),
            "mid_year_review": data.get("mid_year_review"),
            "year_end_review": data.get("year_end_review"),
            "is_active": True, "created_at": datetime.now().isoformat(),
        }).execute()
        return jsonify(result.data[0]), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/pms-cycles/close", methods=["POST"])
def close_pms_cycle():
    try:
        if get_request_level() > 1:
            return jsonify({"error": "Only HQ Admin can close PMS cycles."}), 403
        cycle = get_active_pms_cycle()
        if not cycle:
            return jsonify({"error": "No active PMS cycle found."}), 404
        supabase.table("pms_cycles").update({"is_active": False}).eq("id", cycle["id"]).execute()
        return jsonify({"message": f"PMS cycle {cycle['pms_year']} closed."}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/pms-cycles/open-next", methods=["POST"])
def open_next_pms_cycle():
    try:
        if get_request_level() > 1:
            return jsonify({"error": "Only HQ Admin can open the next PMS cycle."}), 403
        current   = get_active_pms_cycle()
        next_year = int(current["pms_year"]) + 1 if current else date.today().year
        if current:
            supabase.table("pms_cycles").update({"is_active": False}).eq("id", current["id"]).execute()
        pms_start     = date(next_year, PMS_START_MONTH, PMS_START_DAY)
        objective_end = pms_start + relativedelta(months=OBJECTIVE_SETTING_MONTHS)
        grace_end     = objective_end + timedelta(days=GRACE_PERIOD_DAYS)
        data   = request.get_json() or {}
        result = supabase.table("pms_cycles").insert({
            "pms_year": next_year, "pms_start": pms_start.isoformat(),
            "objective_setting_end": objective_end.isoformat(),
            "grace_period_end": grace_end.isoformat(),
            "mid_year_review": data.get("mid_year_review"),
            "year_end_review": data.get("year_end_review"),
            "is_active": True, "created_at": datetime.now().isoformat(),
        }).execute()
        return jsonify({"message": f"Cycle {next_year} opened.", "cycle": result.data[0]}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# COUNTRIES ROUTE
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/countries", methods=["GET"])
def get_countries():
    try:
        result = supabase.table("countries").select("id, name, code").order("name").execute()
        return jsonify(result.data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# BRANCHES ROUTE
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/branches", methods=["GET"])
def get_branches():
    try:
        result = supabase.table("branches").select("id, code, name, country_id").order("name").execute()
        if result.data:
            return jsonify(result.data), 200
        depts = supabase.table("departments").select("branch_id").execute().data
        unique_branch_ids = list(set(d["branch_id"] for d in depts if d.get("branch_id")))
        return jsonify([{"id": bid, "name": bid, "code": bid, "country_id": None} for bid in unique_branch_ids]), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/branches", methods=["POST"])
def create_branch():
    try:
        data = request.get_json()
        code = data.get("code", "").strip().upper()
        name = data.get("name", "").strip()
        if not code: return jsonify({"error": "Branch code is required"}), 400
        if not name: return jsonify({"error": "Branch name is required"}), 400
        if supabase.table("branches").select("id").eq("code", code).execute().data:
            return jsonify({"error": f"Branch '{code}' already exists."}), 409
        result = supabase.table("branches").insert({
            "code": code, "name": name, "country_id": data.get("country_id") or None
        }).execute()
        return jsonify(result.data[0]), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# SUB-DEPARTMENTS ROUTE
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/sub-departments", methods=["GET"])
def get_sub_departments():
    try:
        dept_filter = request.args.get("department_id", "").strip()
        query = supabase.table("sub_departments").select("id, name, code, department_id").order("name")
        if dept_filter:
            query = query.eq("department_id", dept_filter)
        return jsonify(query.execute().data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# TEMPLATE ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/templates", methods=["POST"])
def save_template():
    try:
        data     = request.get_json()
        now      = datetime.now().isoformat()
        cycle    = get_active_pms_cycle()
        cycle_id = cycle["id"] if cycle else None
        result   = supabase.table("templates").insert({
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
        return jsonify({"message": "Template saved!", "id": result.data[0]["id"]}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/templates", methods=["GET"])
def get_templates():
    try:
        try:
            templates = (
                supabase.table("templates")
                .select("*")
                .order("lastModified", desc=True)
                .execute()
                .data
            )
        except Exception:
            templates = supabase.table("templates").select("*").execute().data
            templates.sort(
                key=lambda t: t.get("lastModified") or t.get("lastmodified") or t.get("created_at") or "",
                reverse=True,
            )

        mapping      = supabase.table("template_assignments").select("*").execute().data
        designations = supabase.table("designations").select("*").execute().data
        departments  = supabase.table("departments").select("*").execute().data
        branches     = supabase.table("branches").select("id, code, name, country_id").execute().data
        countries    = supabase.table("countries").select("id, name, code").execute().data
        users        = supabase.table("users").select("id, full_name").execute().data

        active_cycle         = get_active_pms_cycle()
        active_cycle_id      = active_cycle["id"] if active_cycle else None
        active_freeze_status = get_freeze_status()

        for template in templates:
            if "template_content" in template:
                template["categories"] = template.pop("template_content")

            t_id          = template["id"]
            # For display purposes, use only rule rows (user_id IS NULL) so we
            # don't inflate counts with per-user rows.
            t_assignments = [m for m in mapping if m["template_id"] == t_id and m.get("user_id") is None]
            # But for assigned employee display, use rows where user_id IS set
            t_user_rows   = [m for m in mapping if m["template_id"] == t_id and m.get("user_id") is not None]

            assigned_designation_ids = list(set(m["designation_id"] for m in t_assignments if m.get("designation_id")))
            assigned_dept_ids        = list(set(str(m["department_id"]) for m in t_assignments if m.get("department_id")))
            assigned_branch_ids      = list(set(str(m["branch_id"]) for m in t_assignments if m.get("branch_id")))
            assigned_country_ids     = list(set(str(m["country_id"]) for m in t_assignments if m.get("country_id")))
            assigned_sub_dept_ids    = list(set(str(m["sub_department_id"]) for m in t_assignments if m.get("sub_department_id")))
            assigned_user_ids        = list(set(str(m["user_id"]) for m in t_user_rows))

            template["assignedDesignations"]    = [r["name"] for r in designations if r["id"] in assigned_designation_ids]
            template["assignedDesignationIds"]  = assigned_designation_ids
            template["assignedDepartments"]     = [
                {
                    "id":        str(d["id"]),
                    "name":      d["name"],
                    "code":      d.get("code"),
                    "branch_id": str(d["branch_id"]) if d.get("branch_id") else None,
                }
                for d in departments if str(d["id"]) in assigned_dept_ids
            ]
            template["assignedDepartmentNames"] = [d["name"] for d in departments if str(d["id"]) in assigned_dept_ids]
            template["assignedDepartmentsIds"]  = assigned_dept_ids
            template["assignedBranches"]        = [
                {"id": str(b["id"]), "name": b["name"], "code": b.get("code")}
                for b in branches if str(b["id"]) in assigned_branch_ids
            ]
            template["assignedBranchIds"]       = assigned_branch_ids
            template["assignedCountries"]       = [
                {"id": str(c["id"]), "name": c["name"], "code": c.get("code")}
                for c in countries if str(c["id"]) in assigned_country_ids
            ]
            template["assignedCountryIds"]      = assigned_country_ids
            template["assignedEmployees"]       = [u["full_name"] for u in users if str(u["id"]) in assigned_user_ids]
            template["assignedEmployeeIds"]     = assigned_user_ids
            # assignedRules = rule rows only (user_id IS NULL) for the dashboard display
            template["assignedRules"]           = [
                {
                    "designation_id":    m.get("designation_id"),
                    "department_id":     str(m["department_id"])     if m.get("department_id")     else None,
                    "branch_id":         str(m["branch_id"])         if m.get("branch_id")         else None,
                    "country_id":        str(m["country_id"])        if m.get("country_id")        else None,
                    "sub_department_id": str(m["sub_department_id"]) if m.get("sub_department_id") else None,
                    "user_id":           None,
                    "scope":             m.get("scope"),
                }
                for m in t_assignments
            ]

            if template.get("max_score") is None:
                template["max_score"] = DEFAULT_MAX_SCORE

            if "lastModified" not in template or template["lastModified"] is None:
                template["lastModified"] = template.get("lastmodified") or template.get("created_at")

            t_cycle_id = template.get("pms_cycle_id")
            if t_cycle_id and active_cycle_id and int(t_cycle_id) != int(active_cycle_id):
                template["freeze_status"] = "frozen"
                template["is_past_cycle"] = True
            else:
                template["freeze_status"] = active_freeze_status
                template["is_past_cycle"] = False

        return jsonify(templates), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


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
        if "lastModified" not in template or template["lastModified"] is None:
            template["lastModified"] = template.get("lastmodified") or template.get("created_at")

        active          = get_active_pms_cycle()
        active_cycle_id = active["id"] if active else None
        t_cycle_id      = template.get("pms_cycle_id")
        if t_cycle_id and active_cycle_id and int(t_cycle_id) != int(active_cycle_id):
            template["freeze_status"] = "frozen"
            template["is_past_cycle"] = True
        else:
            template["freeze_status"] = get_freeze_status()
            template["is_past_cycle"] = False

        return jsonify(template), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/templates/<int:template_id>", methods=["PUT"])
def update_template(template_id):
    try:
        if is_template_from_past_cycle(template_id):
            return jsonify({
                "error": "This template belongs to a past PMS cycle and is permanently frozen."
            }), 403

        level = get_request_level()
        if not can_role_edit(level):
            status  = get_freeze_status()
            message = (
                "Templates are fully frozen — no changes permitted until next PMS cycle."
                if status == "frozen"
                else "Only HQ Admin can edit during the grace period."
            )
            return jsonify({"error": message}), 403

        data           = request.get_json()
        now            = datetime.now().isoformat()
        update_payload = {"lastModified": now}

        if data.get("name")        is not None: update_payload["name"]             = data["name"]
        if data.get("description") is not None: update_payload["description"]      = data["description"]
        if data.get("max_score")   is not None: update_payload["max_score"]        = data["max_score"]
        if data.get("categories")  is not None: update_payload["template_content"] = data["categories"]
        if data.get("totalWeight") is not None: update_payload["total_weight"]     = data["totalWeight"]

        supabase.table("templates").update(update_payload).eq("id", template_id).execute()
        return jsonify({"message": "Template updated successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/templates/<int:template_id>", methods=["DELETE"])
def delete_template(template_id):
    try:
        if is_template_from_past_cycle(template_id):
            return jsonify({
                "error": "Cannot delete — this template belongs to a past PMS cycle and is permanently frozen."
            }), 403

        if not can_role_edit(get_request_level()):
            return jsonify({"error": "Cannot delete — template is frozen or you lack permission."}), 403

        supabase.table("template_assignments").delete().eq("template_id", template_id).execute()
        supabase.table("templates").delete().eq("id", template_id).execute()
        return jsonify({"message": "Template deleted successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# ASSIGNMENT — CORE RESOLVER
# ─────────────────────────────────────────────────────────────────────────────

def _resolve_rules_to_user_rows(template_id: int, rules: list, all_users: list) -> list:
    """
    Expands each assignment rule into:
      1. One 'rule' row  (user_id=None)  — preserved for dashboard display / assignedRules.
      2. One row per matching user (user_id=<uuid>) — enables fast /my-templates lookup.

    KEY FIX: Per-user rows are stored with the user's OWN profile values
    (designation_id, department_id, branch_id, country_id, sub_department_id)
    so every column is fully populated regardless of which rule type matched them.

    Scope mapping:
      all_country_admins  → designation_id == DESIGNATION_CA  (optionally filtered by country_id)
      all_branch_admins   → designation_id == DESIGNATION_BA
      all_dept_admins     → designation_id == DESIGNATION_DA
      all_sub_dept_admins → designation_id == DESIGNATION_SDA

    Standard rules match users where ALL supplied fields agree with the user's profile.
    A None field in the rule is treated as a wildcard (matches any value).
    """
    rows_to_insert = []
    seen_user_ids  = set()   # prevent duplicate per-user rows across rules
    seen_rule_keys = set()   # prevent duplicate rule rows

    SCOPE_TO_DESIG = {
        "all_country_admins":  DESIGNATION_CA,
        "all_branch_admins":   DESIGNATION_BA,
        "all_dept_admins":     DESIGNATION_DA,
        "all_sub_dept_admins": DESIGNATION_SDA,
    }

    def add_rule_row(row: dict):
        """Store the rule itself (user_id=None) for display/audit purposes."""
        key = (
            row.get("scope"),
            row.get("designation_id"),
            row.get("department_id"),
            row.get("branch_id"),
            row.get("country_id"),
            row.get("sub_department_id"),
        )
        if key not in seen_rule_keys:
            seen_rule_keys.add(key)
            rows_to_insert.append({**row, "user_id": None})

    def add_user_row(user: dict, scope: str | None):
        """
        Store one row per resolved user with ALL profile columns populated from
        the user's own data. This ensures country_id, sub_department_id, branch_id,
        department_id and designation_id are always stored — never left as None
        because the rule happened to be a wildcard or scope-based.
        """
        uid = str(user["id"])
        if uid in seen_user_ids:
            return
        seen_user_ids.add(uid)
        rows_to_insert.append({
            "template_id":       template_id,
            "user_id":           uid,
            "designation_id":    int(user["designation_id"])    if user.get("designation_id")    else None,
            "department_id":     str(user["department_id"])     if user.get("department_id")     else None,
            "branch_id":         str(user["branch_id"])         if user.get("branch_id")         else None,
            "country_id":        str(user["country_id"])        if user.get("country_id")        else None,
            "sub_department_id": str(user["sub_department_id"]) if user.get("sub_department_id") else None,
            "scope":             scope,
        })

    for rule in rules:

        # ── 1. Direct user assignment ──────────────────────────────────────
        if rule.get("user_id"):
            uid = str(rule["user_id"]).strip()
            matched = next((u for u in all_users if str(u["id"]) == uid), None)
            if matched:
                # Use the user's real profile columns
                add_user_row(matched, scope=None)
            elif uid not in seen_user_ids:
                # User not found in all_users — store with nulls as safe fallback
                seen_user_ids.add(uid)
                rows_to_insert.append({
                    "template_id":       template_id,
                    "user_id":           uid,
                    "designation_id":    None,
                    "department_id":     None,
                    "branch_id":         None,
                    "country_id":        None,
                    "sub_department_id": None,
                    "scope":             None,
                })
            continue

        # ── 2. Scope-based admin quick-assign ─────────────────────────────
        if rule.get("scope"):
            scope      = rule["scope"]
            country_id = rule.get("country_id") or None
            desig_id   = rule.get("designation_id") or SCOPE_TO_DESIG.get(scope)

            # Rule row stores the intent — using rule-level fields (may be None/wildcard)
            rule_row = {
                "template_id":       template_id,
                "scope":             scope,
                "designation_id":    desig_id,
                "country_id":        country_id,
                "department_id":     rule.get("department_id")     or None,
                "branch_id":         rule.get("branch_id")         or None,
                "sub_department_id": rule.get("sub_department_id") or None,
            }
            add_rule_row(rule_row)

            target_desig = SCOPE_TO_DESIG.get(scope)
            if target_desig:
                for u in all_users:
                    u_desig = int(u["designation_id"]) if u.get("designation_id") else None
                    if u_desig != target_desig:
                        continue
                    # Country-specific filter for CAs
                    if country_id:
                        u_country = str(u["country_id"]) if u.get("country_id") else None
                        if u_country != str(country_id):
                            continue
                    # Per-user row uses user's real profile — not the rule's wildcards
                    add_user_row(u, scope=scope)
            continue

        # ── 3. Standard designation + department + branch rule ─────────────
        rule_desig   = int(rule["designation_id"])    if rule.get("designation_id")    else None
        rule_dept    = str(rule["department_id"])     if rule.get("department_id")     else None
        rule_branch  = str(rule["branch_id"])         if rule.get("branch_id")         else None
        rule_subdept = str(rule["sub_department_id"]) if rule.get("sub_department_id") else None
        rule_country = str(rule["country_id"])        if rule.get("country_id")        else None

        # Skip completely empty rules
        if all(v is None for v in [rule_desig, rule_dept, rule_branch, rule_subdept, rule_country]):
            continue

        rule_row = {
            "template_id":       template_id,
            "designation_id":    rule_desig,
            "department_id":     rule_dept,
            "branch_id":         rule_branch,
            "country_id":        rule_country,
            "sub_department_id": rule_subdept,
            "scope":             None,
        }
        add_rule_row(rule_row)

        # Resolve matching users — per-user rows use the user's own real profile
        for u in all_users:
            u_desig   = int(u["designation_id"])    if u.get("designation_id")    else None
            u_dept    = str(u["department_id"])     if u.get("department_id")     else None
            u_branch  = str(u["branch_id"])         if u.get("branch_id")         else None
            u_subdept = str(u["sub_department_id"]) if u.get("sub_department_id") else None
            u_country = str(u["country_id"])        if u.get("country_id")        else None

            desig_ok   = (rule_desig   is None) or (u_desig   == rule_desig)
            dept_ok    = (rule_dept    is None) or (u_dept    == rule_dept)
            branch_ok  = (rule_branch  is None) or (u_branch  == rule_branch)
            subdept_ok = (rule_subdept is None) or (u_subdept == rule_subdept)
            country_ok = (rule_country is None) or (u_country == rule_country)

            if desig_ok and dept_ok and branch_ok and subdept_ok and country_ok:
                add_user_row(u, scope=None)

    return rows_to_insert


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

        if is_template_from_past_cycle(template_id):
            return jsonify({
                "error": "Cannot modify assignments — this template belongs to a past PMS cycle and is permanently frozen."
            }), 403

        rules = data.get("rules") or []

        # Load all users with ALL profile fields needed for full column population
        all_users = (
            supabase.table("users")
            .select("id, designation_id, department_id, branch_id, country_id, sub_department_id")
            .execute()
            .data
        ) or []

        # Resolve rules → rows (rule rows + per-user rows with full profile columns)
        rows_to_insert = _resolve_rules_to_user_rows(template_id, rules, all_users)

        # Clear existing assignments then bulk-insert
        supabase.table("template_assignments").delete().eq("template_id", template_id).execute()

        if rows_to_insert:
            # Batch inserts to avoid payload size limits
            BATCH_SIZE = 500
            for i in range(0, len(rows_to_insert), BATCH_SIZE):
                supabase.table("template_assignments").insert(rows_to_insert[i:i + BATCH_SIZE]).execute()

        # Bump lastModified on the template
        supabase.table("templates").update({
            "lastModified": datetime.now().isoformat()
        }).eq("id", template_id).execute()

        user_rows = [r for r in rows_to_insert if r.get("user_id")]
        rule_rows = [r for r in rows_to_insert if not r.get("user_id")]

        return jsonify({
            "message":        f"Template assigned: {len(rule_rows)} rule(s), {len(user_rows)} user(s) resolved.",
            "rules_inserted": len(rule_rows),
            "users_resolved": len(user_rows),
            "total_rows":     len(rows_to_insert),
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/assign-template", methods=["POST"])
def assign_template():
    return _do_assign_template()


@app.route("/assign-template", methods=["PUT"])
def update_template_assignment():
    return _do_assign_template()


# ─────────────────────────────────────────────────────────────────────────────
# MY-TEMPLATES ROUTE
# Now a simple indexed lookup — user_id rows are pre-resolved at assignment time.
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/my-templates", methods=["GET"])
def get_my_templates():
    try:
        user_id_param = request.args.get("user_id", "").strip()
        if not user_id_param:
            return jsonify({"error": "user_id query parameter is required"}), 400

        # Verify user exists
        user_result = (
            supabase.table("users")
            .select("id")
            .eq("id", user_id_param)
            .execute()
        )
        if not user_result.data:
            return jsonify({"error": f"No user found with id '{user_id_param}'."}), 404

        # Fast lookup — user_id is pre-resolved at assignment save time
        assignments = (
            supabase.table("template_assignments")
            .select("template_id")
            .eq("user_id", user_id_param)
            .execute()
            .data
        ) or []

        matched_ids = list({a["template_id"] for a in assignments})
        if not matched_ids:
            return jsonify([]), 200

        active          = get_active_pms_cycle()
        active_cycle_id = active["id"] if active else None
        active_freeze   = get_freeze_status()

        all_templates = supabase.table("templates").select("*").execute().data
        my_templates  = []

        for t in all_templates:
            if t["id"] not in matched_ids:
                continue
            if "template_content" in t:
                t["categories"] = t.pop("template_content")
            if t.get("max_score") is None:
                t["max_score"] = DEFAULT_MAX_SCORE
            if not t.get("lastModified"):
                t["lastModified"] = t.get("lastmodified") or t.get("created_at")

            t_cycle_id = t.get("pms_cycle_id")
            if t_cycle_id and active_cycle_id and int(t_cycle_id) != int(active_cycle_id):
                t["freeze_status"] = "frozen"
                t["is_past_cycle"] = True
            else:
                t["freeze_status"] = active_freeze
                t["is_past_cycle"] = False

            my_templates.append(t)

        my_templates.sort(
            key=lambda t: t.get("lastModified") or t.get("created_at") or "",
            reverse=True,
        )
        return jsonify(my_templates), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# DESIGNATION / DEPARTMENT / USER ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/designations", methods=["GET"])
def get_designations():
    try:
        return jsonify(supabase.table("designations").select("*").execute().data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/designations", methods=["POST"])
def add_designation():
    try:
        name = request.json.get("name")
        if not name: return jsonify({"error": "Name required"}), 400
        result = supabase.table("designations").insert({"name": name}).execute()
        return jsonify(result.data[0]), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/departments", methods=["GET"])
def get_departments():
    try:
        branch_filter = request.args.get("branch_id", "").strip()
        query = supabase.table("departments").select("id, name, code, branch_id").order("name")
        if branch_filter:
            query = query.eq("branch_id", branch_filter)
        return jsonify(query.execute().data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/departments", methods=["POST"])
def add_department():
    try:
        data      = request.get_json()
        name      = data.get("name", "").strip()
        code      = data.get("code", "").strip().upper()
        branch_id = data.get("branch_id") or None
        if not name: return jsonify({"error": "Department name is required"}), 400
        if not code: return jsonify({"error": "Department code is required"}), 400
        q = supabase.table("departments").select("id").eq("code", code)
        if branch_id:
            q = q.eq("branch_id", branch_id)
        if q.execute().data:
            return jsonify({"error": f"Department code '{code}' already exists{' in this branch' if branch_id else ''}."}), 409
        result = supabase.table("departments").insert({"name": name, "code": code, "branch_id": branch_id}).execute()
        return jsonify(result.data[0]), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/users", methods=["GET"])
def get_users():
    try:
        return jsonify(
            supabase.table("users")
            .select("id, full_name, branch_id, department_id, designation_id, country_id, sub_department_id")
            .execute()
            .data
        ), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/sync-user", methods=["POST"])
def sync_user():
    try:
        data      = request.get_json()
        user_id   = data.get("user_id", "").strip()
        email     = data.get("email", "")
        full_name = data.get("full_name") or email
        if not user_id: return jsonify({"error": "user_id is required"}), 400
        if supabase.table("users").select("id").eq("id", user_id).execute().data:
            return jsonify({"message": "User already exists", "synced": False}), 200
        supabase.table("users").insert({"id": user_id, "email": email, "full_name": full_name}).execute()
        return jsonify({"message": "User synced successfully", "synced": True}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/debug-user/<user_id>", methods=["GET"])
def debug_user(user_id):
    try:
        user = supabase.table("users").select(
            "id, full_name, designation_id, department_id, branch_id, country_id, sub_department_id"
        ).eq("id", user_id).execute().data
        if not user: return jsonify({"error": "user not found"}), 404

        # Show both rule rows and user rows for this user
        rule_rows = (
            supabase.table("template_assignments")
            .select("*")
            .is_("user_id", "null")
            .execute()
            .data
        )
        user_rows = (
            supabase.table("template_assignments")
            .select("*")
            .eq("user_id", user_id)
            .execute()
            .data
        )
        return jsonify({
            "user":              user[0],
            "resolved_template_count": len(user_rows),
            "resolved_templates":      user_rows,
            "total_rule_rows":         len(rule_rows),
            "rule_rows_sample":        rule_rows[:10],
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    fix_duplicate_active_cycles()
    sync_cycle_dates_from_constants()
    start_scheduler()
    app.run(debug=True, port=5000)