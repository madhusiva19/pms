from flask import Flask, request, jsonify
from flask_cors import CORS
from supabase import create_client, Client
from datetime import date, datetime, timedelta
from dateutil.relativedelta import relativedelta
from datetime import datetime, timezone
from notification_routes import (
    notifications_bp,
    init_notifications,
    start_scheduler,
    seed_notifications_for_cycle,
)
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
DESIGNATION_CA  = 1
DESIGNATION_BA  = 2
DESIGNATION_DA  = 3
DESIGNATION_SDA = 4


# ─────────────────────────────────────────────────────────────────────────────
# STARTUP SYNC
# ─────────────────────────────────────────────────────────────────────────────

def fix_duplicate_active_cycles() -> None:
    try:
        result = supabase.table("pms_cycles").select("*").eq("is_active", True).order("pms_year", desc=True).execute()
        active_cycles = result.data or []
        if len(active_cycles) <= 1:
            return
        keep   = active_cycles[0]
        to_fix = [c["id"] for c in active_cycles[1:]]
        supabase.table("pms_cycles").update({"is_active": False}).in_("id", to_fix).execute()
        print(f"⚠️  fix_duplicate_active_cycles: deactivated {len(to_fix)} duplicate(s), keeping id={keep['id']}")
    except Exception as error:
        print(f"❌ fix_duplicate_active_cycles failed: {error}")


def sync_cycle_dates_from_constants() -> None:
    try:
        result = supabase.table("pms_cycles").select("*").eq("is_active", True).order("pms_year", desc=True).limit(1).execute()
        if not result.data:
            _create_cycle_from_constants()
            return
        cycle = result.data[0]
        if bool(cycle.get("objective_setting_end")) and bool(cycle.get("grace_period_end")):
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
        _maybe_rollover_cycle({**cycle, "objective_setting_end": objective_end.isoformat(), "grace_period_end": grace_end.isoformat()})
    except Exception as error:
        print(f"❌ sync_cycle_dates_from_constants failed: {error}")


def _create_cycle_from_constants() -> None:
    today = date.today()
    year  = today.year
    pms_start = date(year, PMS_START_MONTH, PMS_START_DAY)
    if today < pms_start:
        pms_start = date(year - 1, PMS_START_MONTH, PMS_START_DAY)
    objective_end = pms_start + relativedelta(months=OBJECTIVE_SETTING_MONTHS)
    grace_end     = objective_end + timedelta(days=GRACE_PERIOD_DAYS)
    result = supabase.table("pms_cycles").insert({
        "pms_year": pms_start.year, "pms_start": pms_start.isoformat(),
        "objective_setting_end": objective_end.isoformat(), "grace_period_end": grace_end.isoformat(),
        "is_active": True, "created_at": datetime.now().isoformat(),
    }).execute()
    print(f"✅ sync: created new cycle {pms_start.year} from constants.")
    if result.data:
        seed_notifications_for_cycle(result.data[0])


def _maybe_rollover_cycle(cycle: dict) -> None:
    try:
        grace_end_str = cycle.get("grace_period_end") or cycle.get("grace_end")
        if not grace_end_str:
            return
        grace_end = datetime.fromisoformat(grace_end_str).date()
        today     = date.today()
        obj_end_str = cycle.get("objective_setting_end")
        if obj_end_str and today <= datetime.fromisoformat(obj_end_str).date():
            return
        if today <= grace_end:
            return
        pms_start     = datetime.fromisoformat(cycle["pms_start"]).date()
        objective_end = datetime.fromisoformat(cycle["objective_setting_end"]).date()
        obj_months    = (objective_end.year - pms_start.year) * 12 + (objective_end.month - pms_start.month)
        grace_days    = (grace_end - objective_end).days
        next_start     = date(pms_start.year + 1, pms_start.month, pms_start.day)
        next_obj_end   = next_start + relativedelta(months=obj_months)
        next_grace_end = next_obj_end + timedelta(days=grace_days)
        if supabase.table("pms_cycles").select("id").eq("pms_year", next_start.year).execute().data:
            return
        supabase.table("pms_cycles").update({"is_active": False}).eq("id", cycle["id"]).execute()
        new_cycle_result = supabase.table("pms_cycles").insert({
            "pms_year": next_start.year, "pms_start": next_start.isoformat(),
            "objective_setting_end": next_obj_end.isoformat(), "grace_period_end": next_grace_end.isoformat(),
            "is_active": True, "created_at": datetime.now().isoformat(),
        }).execute()
        print(f"✅ rollover: created cycle {next_start.year}")
        if new_cycle_result.data:
            seed_notifications_for_cycle(new_cycle_result.data[0])
    except Exception as error:
        print(f"❌ _maybe_rollover_cycle failed: {error}")


# ─────────────────────────────────────────────────────────────────────────────
# FREEZE HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def get_active_pms_cycle() -> dict | None:
    try:
        result = supabase.table("pms_cycles").select("*").eq("is_active", True).order("pms_year", desc=True).limit(1).execute()
        if result.data:
            return result.data[0]
    except Exception:
        pass
    return None


def compute_freeze_dates_from_cycle(cycle: dict) -> dict:
    pms_start     = datetime.fromisoformat(cycle["pms_start"]).date()
    objective_end = datetime.fromisoformat(cycle["objective_setting_end"]).date() if cycle.get("objective_setting_end") else pms_start + relativedelta(months=OBJECTIVE_SETTING_MONTHS)
    grace_end     = datetime.fromisoformat(cycle["grace_period_end"]).date()      if cycle.get("grace_period_end")      else objective_end + timedelta(days=GRACE_PERIOD_DAYS)
    return {"pms_start": pms_start, "objective_end": objective_end, "grace_end": grace_end}


def compute_freeze_dates_from_constants() -> dict:
    today = date.today()
    pms_start = date(today.year, PMS_START_MONTH, PMS_START_DAY)
    if today < pms_start:
        pms_start = date(today.year - 1, PMS_START_MONTH, PMS_START_DAY)
    objective_end = pms_start + relativedelta(months=OBJECTIVE_SETTING_MONTHS)
    grace_end     = objective_end + timedelta(days=GRACE_PERIOD_DAYS)
    return {"pms_start": pms_start, "objective_end": objective_end, "grace_end": grace_end}


def get_freeze_status() -> str:
    today = date.today()
    cycle = get_active_pms_cycle()
    dates = compute_freeze_dates_from_cycle(cycle) if cycle else compute_freeze_dates_from_constants()
    if today >= dates["grace_end"]:     return "frozen"
    if today >= dates["objective_end"]: return "grace"
    return "open"


def can_role_edit(level: int) -> bool:
    status = get_freeze_status()
    if status == "frozen":              return False
    if status == "grace" and level > 1: return False
    return True


def get_request_level() -> int:
    return int(request.headers.get("X-User-Level", 1))


def is_template_from_past_cycle(template_id: int) -> bool:
    try:
        result = supabase.table("templates").select("pms_cycle_id").eq("id", template_id).single().execute()
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


# ─────────────────────────────────────────────────────────────────────────────
# UNFREEZE HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def get_unfreeze_exceptions(template_id: int, pms_cycle_id: int | None = None) -> list:
    try:
        query = supabase.table("template_unfreezes").select("*").eq("template_id", template_id)
        if pms_cycle_id:
            query = query.eq("pms_cycle_id", pms_cycle_id)
        return query.execute().data or []
    except Exception:
        return []


# ─────────────────────────────────────────────────────────────────────────────
# VARIANT HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def get_variants_for_template(template_id: int, pms_cycle_id: int | None = None) -> list:
    try:
        query = supabase.table("template_variants").select("*").eq("parent_template_id", template_id)
        if pms_cycle_id:
            query = query.eq("pms_cycle_id", pms_cycle_id)
        return query.execute().data or []
    except Exception:
        return []


def get_variant_for_branch(template_id: int, branch_id: str, pms_cycle_id: int) -> dict | None:
    try:
        result = (
            supabase.table("template_variants")
            .select("*")
            .eq("parent_template_id", template_id)
            .eq("branch_id", branch_id)
            .eq("pms_cycle_id", pms_cycle_id)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None
    except Exception:
        return None


def get_variant_for_country(template_id: int, country_id: str, pms_cycle_id: int) -> dict | None:
    try:
        result = (
            supabase.table("template_variants")
            .select("*")
            .eq("parent_template_id", template_id)
            .eq("country_id", country_id)
            .eq("pms_cycle_id", pms_cycle_id)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# TEMPLATE ENRICHMENT
#
# Reads rules   from: template_assignment_combinations  (no user_id column)
# Reads users   from: template_assignments       (user_id always populated)
# ─────────────────────────────────────────────────────────────────────────────

def _enrich_templates(templates: list) -> list:
    # Load all assignment rules (logical rules, no user_ids)
    try:
        all_rules = supabase.table("template_assignment_combinations").select("*").execute().data or []
    except Exception:
        all_rules = []

    # Load all user assignments (user_id always populated)
    try:
        all_user_assignments = supabase.table("template_assignments").select("*").execute().data or []
    except Exception:
        all_user_assignments = []

    designations    = supabase.table("designations").select("*").execute().data
    departments     = supabase.table("departments").select("*").execute().data
    sub_departments = supabase.table("sub_departments").select("id, name, code, department_id").execute().data
    branches        = supabase.table("branches").select("id, code, name, country_id").execute().data
    countries       = supabase.table("countries").select("id, name, code").execute().data
    users           = supabase.table("users").select("id, full_name").execute().data

    active_cycle         = get_active_pms_cycle()
    active_cycle_id      = active_cycle["id"] if active_cycle else None
    active_freeze_status = get_freeze_status()

    try:
        all_exceptions = supabase.table("template_unfreezes").select("*").eq("pms_cycle_id", active_cycle_id).execute().data or [] if active_cycle_id else []
    except Exception:
        all_exceptions = []

    try:
        all_variants = supabase.table("template_variants").select("id, parent_template_id, branch_id, country_id, name, lastModified").eq("pms_cycle_id", active_cycle_id).execute().data or [] if active_cycle_id else []
    except Exception:
        all_variants = []

    # Build lookup maps for name resolution
    desig_map   = {str(d["id"]): d["name"] for d in designations}
    dept_map    = {str(d["id"]): d for d in departments}
    subdept_map = {str(s["id"]): s for s in sub_departments}
    branch_map  = {str(b["id"]): b for b in branches}
    country_map = {str(c["id"]): c for c in countries}

    for template in templates:
        if "template_content" in template:
            template["categories"] = template.pop("template_content")

        t_id = template["id"]

        # ── Rules from template_assignment_combinations ──────────────────────────
        t_rules = [r for r in all_rules if r["template_id"] == t_id]

        # ── User assignments from template_assignments ────────────────────
        t_user_rows = [m for m in all_user_assignments if m["template_id"] == t_id]

        # Derive IDs for dashboard display from rules
        assigned_designation_ids = list(set(r["designation_id"] for r in t_rules if r.get("designation_id")))
        assigned_dept_ids        = list(set(str(r["department_id"]) for r in t_rules if r.get("department_id")))
        assigned_branch_ids      = list(set(str(r["branch_id"]) for r in t_rules if r.get("branch_id")))
        assigned_sub_dept_ids    = list(set(str(r["sub_department_id"]) for r in t_rules if r.get("sub_department_id")))
        assigned_user_ids        = list(set(str(m["user_id"]) for m in t_user_rows if m.get("user_id")))
        assigned_country_ids     = list(set(str(r["country_id"]) for r in t_rules if r.get("country_id")))
        # Also include countries from user rows (scope-based CAs may have country_id on user rows)
        for m in t_user_rows:
            if m.get("country_id"):
                cid = str(m["country_id"])
                if cid not in assigned_country_ids:
                    assigned_country_ids.append(cid)

        # Direct user IDs come from template_assignments rows that have no matching rule
        # (i.e. users assigned directly, not via designation+dept combinations)
        direct_user_ids_from_assignments = list(set(
            str(m["user_id"]) for m in t_user_rows
            if m.get("user_id") and not m.get("designation_id") and not m.get("department_id")
        ))

        template["assignedDesignations"]     = [desig_map.get(str(did), str(did)) for did in assigned_designation_ids]
        template["assignedDesignationIds"]   = assigned_designation_ids
        template["assignedDepartments"]      = [
            {"id": str(d["id"]), "name": d["name"], "code": d.get("code"), "branch_id": str(d["branch_id"]) if d.get("branch_id") else None}
            for d in departments if str(d["id"]) in assigned_dept_ids
        ]
        template["assignedDepartmentNames"]  = [dept_map[did]["name"] for did in assigned_dept_ids if did in dept_map]
        template["assignedDepartmentsIds"]   = assigned_dept_ids
        template["assignedBranches"]         = [
            {"id": str(b["id"]), "name": b["name"], "code": b.get("code"), "country_id": str(b["country_id"]) if b.get("country_id") else None}
            for b in branches if str(b["id"]) in assigned_branch_ids
        ]
        template["assignedBranchIds"]        = assigned_branch_ids
        template["assignedCountries"]        = [
            {"id": str(c["id"]), "name": c["name"], "code": c.get("code")}
            for c in countries if str(c["id"]) in assigned_country_ids
        ]
        template["assignedCountryIds"]       = assigned_country_ids
        template["assignedEmployees"]        = [u["full_name"] for u in users if str(u["id"]) in assigned_user_ids]
        template["assignedEmployeeIds"]      = assigned_user_ids
        template["assignedDirectUserIds"]    = direct_user_ids_from_assignments
        template["assignedSubDepartments"]   = [
            {"id": str(s["id"]), "name": s["name"], "code": s.get("code")}
            for s in sub_departments if str(s["id"]) in assigned_sub_dept_ids
        ]
        template["assignedSubDepartmentIds"] = assigned_sub_dept_ids

        # assignedRules — enriched with resolved names for the frontend
        # Only includes rows from template_assignment_combinations (logical rules, no direct users)
        template["assignedRules"] = [
            {
                "designation_id":    r.get("designation_id"),
                "designation_name":  desig_map.get(str(r["designation_id"]), "") if r.get("designation_id") else None,
                "department_id":     str(r["department_id"])     if r.get("department_id")     else None,
                "department_name":   dept_map.get(str(r["department_id"]), {}).get("name") if r.get("department_id") else None,
                "branch_id":         str(r["branch_id"])         if r.get("branch_id")         else None,
                "branch_name":       (lambda b: (b["code"] + " — " + b["name"]) if b else None)(branch_map.get(str(r["branch_id"]))) if r.get("branch_id") else None,
                "country_id":        str(r["country_id"])        if r.get("country_id")        else None,
                "country_name":      (lambda c: (c.get("code") or "") + " — " + c["name"])(country_map.get(str(r["country_id"]))) if r.get("country_id") else None,
                "sub_department_id": str(r["sub_department_id"]) if r.get("sub_department_id") else None,
                "sub_department_name": subdept_map.get(str(r["sub_department_id"]), {}).get("name") if r.get("sub_department_id") else None,
                "user_id":           None,   # combination rules never have user_id
                "scope":             r.get("scope"),
            }
            for r in t_rules
        ]

        # Append direct-user rules from template_assignments so frontend can reconstruct UserCards
        for uid in direct_user_ids_from_assignments:
            template["assignedRules"].append({
                "designation_id":      None,
                "designation_name":    None,
                "department_id":       None,
                "department_name":     None,
                "branch_id":           None,
                "branch_name":         None,
                "country_id":          None,
                "country_name":        None,
                "sub_department_id":   None,
                "sub_department_name": None,
                "user_id":             uid,
                "scope":               None,
            })

        if template.get("max_score") is None:
            template["max_score"] = DEFAULT_MAX_SCORE
        if "lastModified" not in template or template["lastModified"] is None:
            template["lastModified"] = template.get("lastmodified") or template.get("created_at")

        t_cycle_id = template.get("pms_cycle_id")
        is_past    = bool(t_cycle_id and active_cycle_id and int(t_cycle_id) != int(active_cycle_id))
        template["is_past_cycle"] = is_past
        template["freeze_status"] = "frozen" if is_past else active_freeze_status

        t_exceptions = [e for e in all_exceptions if e["template_id"] == t_id] if not is_past else []
        template["unfrozenBranchIds"]  = [str(e["branch_id"])  for e in t_exceptions if e.get("branch_id")]
        template["unfrozenCountryIds"] = [str(e["country_id"]) for e in t_exceptions if e.get("country_id")]
        template["unfreezeExceptions"] = [
            {"id": e["id"], "branch_id": str(e["branch_id"]) if e.get("branch_id") else None,
             "country_id": str(e["country_id"]) if e.get("country_id") else None, "unfrozen_at": e.get("unfrozen_at")}
            for e in t_exceptions
        ]

        t_variants = [v for v in all_variants if v["parent_template_id"] == t_id] if not is_past else []
        template["variants"] = [
            {
                "id":         v["id"],
                "branch_id":  str(v["branch_id"])  if v.get("branch_id")  else None,
                "country_id": str(v["country_id"]) if v.get("country_id") else None,
                "name":       v.get("name"),
                "lastModified": v.get("lastModified"),
            }
            for v in t_variants
        ]
        template["hasVariants"] = len(t_variants) > 0

    return templates


# ─────────────────────────────────────────────────────────────────────────────
# DEBUG / PMS CYCLE ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/debug-freeze", methods=["GET"])
def debug_freeze():
    try:
        today = date.today()
        cycle = get_active_pms_cycle()
        if not cycle:
            dates = compute_freeze_dates_from_constants()
            return jsonify({"today": str(today), "cycle": None, "source": "constants",
                            "pms_start": str(dates["pms_start"]), "objective_end": str(dates["objective_end"]),
                            "grace_end": str(dates["grace_end"]), "freeze_status": get_freeze_status()}), 200
        dates = compute_freeze_dates_from_cycle(cycle)
        return jsonify({"today": str(today), "source": "database",
                        "active_cycle_id": cycle["id"], "active_cycle_year": cycle["pms_year"],
                        "computed_objective_end": str(dates["objective_end"]),
                        "computed_grace_end": str(dates["grace_end"]),
                        "freeze_status": get_freeze_status()}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/pms-cycles", methods=["GET"])
def get_pms_cycles():
    try:
        return jsonify(supabase.table("pms_cycles").select("*").order("pms_year", desc=True).execute().data), 200
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
                "pms_start": dates["pms_start"].isoformat(),
                "objective_end": dates["objective_end"].isoformat(), "grace_end": dates["grace_end"].isoformat(),
                "objective_setting_end": dates["objective_end"].isoformat(), "grace_period_end": dates["grace_end"].isoformat(),
                "mid_year_review": None, "year_end_review": None,
                "is_active": True, "freeze_status": get_freeze_status(), "source": "constants",
            }), 200
        dates = compute_freeze_dates_from_cycle(cycle)
        return jsonify({**cycle,
                        "objective_end": dates["objective_end"].isoformat(), "grace_end": dates["grace_end"].isoformat(),
                        "objective_setting_end": dates["objective_end"].isoformat(), "grace_period_end": dates["grace_end"].isoformat(),
                        "freeze_status": get_freeze_status(), "source": "database"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/pms-cycles/<int:cycle_id>", methods=["PUT"])
def update_pms_cycle(cycle_id):
    try:
        if get_request_level() > 1:
            return jsonify({"error": "Only HQ Admin can update PMS cycles."}), 403
        data = request.get_json()
        payload = {f: data[f] for f in ["mid_year_review", "year_end_review", "grace_period_end", "objective_setting_end"] if data.get(f)}
        if payload:
            supabase.table("pms_cycles").update(payload).eq("id", cycle_id).execute()
        return jsonify({"message": "PMS cycle updated"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/pms-cycles", methods=["POST"])
def create_pms_cycle():
    try:
        if get_request_level() > 1:
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
            "pms_year": int(year), "pms_start": pms_start.isoformat(),
            "objective_setting_end": objective_end.isoformat(), "grace_period_end": grace_end.isoformat(),
            "mid_year_review": data.get("mid_year_review"), "year_end_review": data.get("year_end_review"),
            "is_active": True, "created_at": datetime.now().isoformat(),
        }).execute()
        if result.data:
            seed_notifications_for_cycle(result.data[0])
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
            "objective_setting_end": objective_end.isoformat(), "grace_period_end": grace_end.isoformat(),
            "mid_year_review": data.get("mid_year_review"), "year_end_review": data.get("year_end_review"),
            "is_active": True, "created_at": datetime.now().isoformat(),
        }).execute()
        if result.data:
            seed_notifications_for_cycle(result.data[0])
        return jsonify({"message": f"Cycle {next_year} opened.", "cycle": result.data[0]}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# COUNTRIES / BRANCHES / SUB-DEPARTMENTS
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/countries", methods=["GET"])
def get_countries():
    try:
        return jsonify(supabase.table("countries").select("id, name, code").order("name").execute().data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/branches", methods=["GET"])
def get_branches():
    try:
        result = supabase.table("branches").select("id, code, name, country_id").order("name").execute()
        if result.data:
            return jsonify(result.data), 200
        depts     = supabase.table("departments").select("branch_id").execute().data
        unique_ids = list(set(d["branch_id"] for d in depts if d.get("branch_id")))
        return jsonify([{"id": bid, "name": bid, "code": bid, "country_id": None} for bid in unique_ids]), 200
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
        result = supabase.table("branches").insert({"code": code, "name": name, "country_id": data.get("country_id") or None}).execute()
        return jsonify(result.data[0]), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


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
            "name": data.get("name"), "description": data.get("description"),
            "max_score": data.get("max_score", DEFAULT_MAX_SCORE),
            "template_content": data.get("categories"), "total_weight": data.get("totalWeight"),
            "pms_cycle_id": cycle_id, "status": "active",
            "created_at": now, "lastModified": now, "created_by": None,
        }).execute()
        return jsonify({"message": "Template saved!", "id": result.data[0]["id"]}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/templates", methods=["GET"])
def get_templates():
    try:
        try:
            templates = supabase.table("templates").select("*").order("lastModified", desc=True).execute().data
        except Exception:
            templates = supabase.table("templates").select("*").execute().data
            templates.sort(key=lambda t: t.get("lastModified") or t.get("lastmodified") or t.get("created_at") or "", reverse=True)
        return jsonify(_enrich_templates(templates)), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/templates/<int:template_id>", methods=["GET"])
def get_single_template(template_id):
    try:
        result = supabase.table("templates").select("*").eq("id", template_id).single().execute()
        if not result.data:
            return jsonify({"error": "Template not found"}), 404
        return jsonify(_enrich_templates([result.data])[0]), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/templates/<int:template_id>", methods=["PUT"])
def update_template(template_id):
    try:
        if is_template_from_past_cycle(template_id):
            return jsonify({"error": "This template belongs to a past PMS cycle and is permanently frozen."}), 403

        level         = get_request_level()
        unfreeze_mode = request.headers.get("X-Unfreeze-Mode", "0") == "1"

        if unfreeze_mode and level == 1:
            active = get_active_pms_cycle()
            if active:
                exceptions = get_unfreeze_exceptions(template_id, active["id"])
                if not exceptions:
                    return jsonify({"error": "No active unfreeze exceptions — cannot edit frozen template."}), 403
            else:
                return jsonify({"error": "No active PMS cycle."}), 403
        elif not can_role_edit(level):
            status = get_freeze_status()
            return jsonify({"error": "Templates are fully frozen — no changes permitted." if status == "frozen" else "Only HQ Admin can edit during the grace period."}), 403

        data    = request.get_json()
        now     = datetime.now().isoformat()
        payload = {"lastModified": now}
        if data.get("name")        is not None: payload["name"]             = data["name"]
        if data.get("description") is not None: payload["description"]      = data["description"]
        if data.get("max_score")   is not None: payload["max_score"]        = data["max_score"]
        if data.get("categories")  is not None: payload["template_content"] = data["categories"]
        if data.get("totalWeight") is not None: payload["total_weight"]     = data["totalWeight"]
        supabase.table("templates").update(payload).eq("id", template_id).execute()
        return jsonify({"message": "Template updated successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/templates/<int:template_id>", methods=["DELETE"])
def delete_template(template_id):
    try:
        if is_template_from_past_cycle(template_id):
            return jsonify({"error": "Cannot delete — past-cycle template is permanently frozen."}), 403
        if not can_role_edit(get_request_level()):
            return jsonify({"error": "Cannot delete — template is frozen or you lack permission."}), 403
        # Delete from both tables
        supabase.table("template_assignment_combinations").delete().eq("template_id", template_id).execute()
        supabase.table("template_assignments").delete().eq("template_id", template_id).execute()
        supabase.table("templates").delete().eq("id", template_id).execute()
        return jsonify({"message": "Template deleted successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# TEMPLATE VARIANT ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/templates/<int:template_id>/variants", methods=["GET"])
def list_variants(template_id):
    try:
        if get_request_level() != 1:
            return jsonify({"error": "Only HQ Admin can view variants."}), 403
        active = get_active_pms_cycle()
        if not active:
            return jsonify([]), 200
        variants = get_variants_for_template(template_id, active["id"])
        branches  = supabase.table("branches").select("id, name, code").execute().data
        countries = supabase.table("countries").select("id, name, code").execute().data
        for v in variants:
            if v.get("template_content"):
                v["categories"] = v.pop("template_content")
            if v.get("branch_id"):
                b = next((x for x in branches if str(x["id"]) == str(v["branch_id"])), None)
                v["branch_name"] = (b["code"] + " — " + b["name"]) if b else str(v["branch_id"])
            if v.get("country_id"):
                c = next((x for x in countries if str(x["id"]) == str(v["country_id"])), None)
                v["country_name"] = (c["code"] + " — " + c["name"]) if c else str(v["country_id"])
        return jsonify(variants), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/templates/<int:template_id>/variants", methods=["POST"])
def create_variant(template_id):
    try:
        if get_request_level() != 1:
            return jsonify({"error": "Only HQ Admin can create variants."}), 403
        if is_template_from_past_cycle(template_id):
            return jsonify({"error": "Cannot create variant for past-cycle template."}), 403

        active = get_active_pms_cycle()
        if not active:
            return jsonify({"error": "No active PMS cycle."}), 400

        data       = request.get_json() or {}
        branch_id  = data.get("branch_id")  or None
        country_id = data.get("country_id") or None

        if not branch_id and not country_id:
            return jsonify({"error": "Provide branch_id or country_id for the variant scope."}), 400

        exceptions = get_unfreeze_exceptions(template_id, active["id"])
        if branch_id:
            if not any(str(e.get("branch_id")) == str(branch_id) for e in exceptions):
                return jsonify({"error": "This branch is not unfrozen. Unfreeze it first before creating a variant."}), 403
        if country_id:
            if not any(str(e.get("country_id")) == str(country_id) for e in exceptions):
                return jsonify({"error": "This country is not unfrozen. Unfreeze it first before creating a variant."}), 403

        if branch_id:
            existing = get_variant_for_branch(template_id, str(branch_id), active["id"])
            if existing:
                return jsonify({"error": "A variant already exists for this branch.", "variant_id": existing["id"]}), 409
        if country_id:
            existing = get_variant_for_country(template_id, str(country_id), active["id"])
            if existing:
                return jsonify({"error": "A variant already exists for this country.", "variant_id": existing["id"]}), 409

        main = supabase.table("templates").select("*").eq("id", template_id).single().execute().data
        if not main:
            return jsonify({"error": "Parent template not found."}), 404

        now = datetime.now(timezone.utc).isoformat()
        result = supabase.table("template_variants").insert({
            "parent_template_id": template_id,
            "branch_id":          str(branch_id)  if branch_id  else None,
            "country_id":         str(country_id) if country_id else None,
            "pms_cycle_id":       active["id"],
            "template_content":   main.get("template_content"),
            "name":               main.get("name"),
            "description":        main.get("description"),
            "max_score":          main.get("max_score", DEFAULT_MAX_SCORE),
            "total_weight":       main.get("total_weight"),
            "created_by":         "hq_admin",
            "created_at":         now,
            "lastModified":       now,
        }).execute()

        variant = result.data[0]
        if variant.get("template_content"):
            variant["categories"] = variant.pop("template_content")
        return jsonify({"message": "Variant created successfully.", "variant": variant}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/templates/<int:template_id>/variants/<int:variant_id>", methods=["GET"])
def get_variant(template_id, variant_id):
    try:
        if get_request_level() != 1:
            return jsonify({"error": "Only HQ Admin can view variants."}), 403
        result = supabase.table("template_variants").select("*").eq("id", variant_id).eq("parent_template_id", template_id).single().execute()
        if not result.data:
            return jsonify({"error": "Variant not found."}), 404
        variant = result.data
        if variant.get("template_content"):
            variant["categories"] = variant.pop("template_content")
        if variant.get("max_score") is None:
            variant["max_score"] = DEFAULT_MAX_SCORE
        return jsonify(variant), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/templates/<int:template_id>/variants/<int:variant_id>", methods=["PUT"])
def update_variant(template_id, variant_id):
    try:
        if get_request_level() != 1:
            return jsonify({"error": "Only HQ Admin can edit variants."}), 403
        if is_template_from_past_cycle(template_id):
            return jsonify({"error": "Past-cycle variants are permanently frozen."}), 403

        v_result = supabase.table("template_variants").select("*").eq("id", variant_id).eq("parent_template_id", template_id).single().execute()
        if not v_result.data:
            return jsonify({"error": "Variant not found."}), 404
        variant = v_result.data

        active = get_active_pms_cycle()
        if not active:
            return jsonify({"error": "No active PMS cycle."}), 400
        if int(variant["pms_cycle_id"]) != int(active["id"]):
            return jsonify({"error": "This variant belongs to a past cycle and is permanently frozen."}), 403

        exceptions = get_unfreeze_exceptions(template_id, active["id"])
        if variant.get("branch_id"):
            if not any(str(e.get("branch_id")) == str(variant["branch_id"]) for e in exceptions):
                return jsonify({"error": "This branch has been re-frozen. Cannot edit variant."}), 403
        if variant.get("country_id"):
            if not any(str(e.get("country_id")) == str(variant["country_id"]) for e in exceptions):
                return jsonify({"error": "This country has been re-frozen. Cannot edit variant."}), 403

        data    = request.get_json()
        now     = datetime.now().isoformat()
        payload = {"lastModified": now}
        if data.get("name")        is not None: payload["name"]             = data["name"]
        if data.get("description") is not None: payload["description"]      = data["description"]
        if data.get("max_score")   is not None: payload["max_score"]        = data["max_score"]
        if data.get("categories")  is not None: payload["template_content"] = data["categories"]
        if data.get("totalWeight") is not None: payload["total_weight"]     = data["totalWeight"]

        supabase.table("template_variants").update(payload).eq("id", variant_id).execute()
        return jsonify({"message": "Variant updated successfully."}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/templates/<int:template_id>/variants/<int:variant_id>", methods=["DELETE"])
def delete_variant(template_id, variant_id):
    try:
        if get_request_level() != 1:
            return jsonify({"error": "Only HQ Admin can delete variants."}), 403
        if is_template_from_past_cycle(template_id):
            return jsonify({"error": "Past-cycle variants cannot be deleted."}), 403
        supabase.table("template_variants").delete().eq("id", variant_id).eq("parent_template_id", template_id).execute()
        return jsonify({"message": "Variant deleted. Branch will use the main template."}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# UNFREEZE EXCEPTION ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/templates/<int:template_id>/unfreeze-exceptions", methods=["GET"])
def get_template_unfreeze_exceptions(template_id):
    try:
        if get_request_level() != 1:
            return jsonify({"error": "Only HQ Admin can view unfreeze exceptions."}), 403
        if is_template_from_past_cycle(template_id):
            return jsonify({"error": "Past-cycle templates cannot be unfrozen."}), 403
        active = get_active_pms_cycle()
        if not active:
            return jsonify([]), 200
        return jsonify(get_unfreeze_exceptions(template_id, active["id"])), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/templates/<int:template_id>/unfreeze-exceptions", methods=["POST"])
def create_unfreeze_exceptions(template_id):
    try:
        if get_request_level() != 1:
            return jsonify({"error": "Only HQ Admin can manage unfreeze exceptions."}), 403
        if is_template_from_past_cycle(template_id):
            return jsonify({"error": "Past-cycle templates cannot be unfrozen."}), 403
        if get_freeze_status() not in ("frozen", "grace"):
            return jsonify({"error": "Template is not frozen — unfreeze is not applicable."}), 400
        active = get_active_pms_cycle()
        if not active:
            return jsonify({"error": "No active PMS cycle found."}), 400
        cycle_id    = active["id"]
        data        = request.get_json() or {}
        branch_ids  = data.get("branch_ids")  or []
        country_ids = data.get("country_ids") or []
        if not branch_ids and not country_ids:
            return jsonify({"error": "Provide at least one branch_id or country_id."}), 400
        now  = datetime.now(timezone.utc).isoformat()
        rows = []
        for bid in branch_ids:
            supabase.table("template_unfreezes").delete().eq("template_id", template_id).eq("branch_id", str(bid)).eq("pms_cycle_id", cycle_id).execute()
            rows.append({"template_id": template_id, "branch_id": str(bid), "country_id": None, "pms_cycle_id": cycle_id, "unfrozen_at": now})
        for cid in country_ids:
            supabase.table("template_unfreezes").delete().eq("template_id", template_id).eq("country_id", str(cid)).eq("pms_cycle_id", cycle_id).execute()
            rows.append({"template_id": template_id, "branch_id": None, "country_id": str(cid), "pms_cycle_id": cycle_id, "unfrozen_at": now})
        if rows:
            supabase.table("template_unfreezes").insert(rows).execute()
        return jsonify({"message": f"Unfrozen {len(rows)} scope(s).", "unfrozen_branches": branch_ids, "unfrozen_countries": country_ids, "pms_cycle_id": cycle_id}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/templates/<int:template_id>/unfreeze-exceptions/bulk-delete", methods=["POST"])
def bulk_delete_unfreeze_exceptions(template_id):
    try:
        if get_request_level() != 1:
            return jsonify({"error": "Only HQ Admin can manage unfreeze exceptions."}), 403
        if is_template_from_past_cycle(template_id):
            return jsonify({"error": "Past-cycle templates cannot be modified."}), 403
        data          = request.get_json() or {}
        exception_ids = data.get("exception_ids") or []
        if not exception_ids:
            return jsonify({"error": "Provide exception_ids to re-freeze."}), 400
        supabase.table("template_unfreezes").delete().in_("id", exception_ids).eq("template_id", template_id).execute()
        return jsonify({"message": f"Re-frozen {len(exception_ids)} scope(s)."}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/templates/<int:template_id>/unfreeze-exceptions/<int:exception_id>", methods=["DELETE"])
def delete_unfreeze_exception(template_id, exception_id):
    try:
        if get_request_level() != 1:
            return jsonify({"error": "Only HQ Admin can manage unfreeze exceptions."}), 403
        if is_template_from_past_cycle(template_id):
            return jsonify({"error": "Past-cycle templates cannot be modified."}), 403
        supabase.table("template_unfreezes").delete().eq("id", exception_id).eq("template_id", template_id).execute()
        return jsonify({"message": "Scope re-frozen successfully."}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# ASSIGNMENT — CORE LOGIC
#
# Two separate writes:
#   1. template_assignment_combinations  — one row per logical rule (scope/desig/dept combos)
#                                          NEVER stores direct user_id assignments
#   2. template_assignments              — one row per matched user (user_id always set)
#                                          stores BOTH rule-matched users AND direct users
#
# Reading back on /templates uses template_assignment_combinations for rule display
# and template_assignments for user counts / /my-templates queries.
# ─────────────────────────────────────────────────────────────────────────────

SCOPE_TO_DESIG = {
    "all_country_admins":  DESIGNATION_CA,
    "all_branch_admins":   DESIGNATION_BA,
    "all_dept_admins":     DESIGNATION_DA,
    "all_sub_dept_admins": DESIGNATION_SDA,
}


def _build_rule_rows(template_id: int, rules: list) -> list:
    """
    Convert frontend rules into clean rows for template_assignment_combinations.
    Each row represents one logical rule (scope or designation+dept combination).

    IMPORTANT: Direct user assignments (rules with user_id) are intentionally
    excluded here — they belong only in template_assignments, not in
    template_assignment_combinations. This prevents direct users from appearing
    as logical rules in the combinations table.
    """
    rows = []
    seen = set()

    for rule in rules:
        # ── Skip direct user rules entirely — stored in template_assignments only ──
        if rule.get("user_id"):
            continue

        scope   = rule.get("scope") or None
        desig   = int(rule["designation_id"])    if rule.get("designation_id")    else None
        dept    = str(rule["department_id"])     if rule.get("department_id")     else None
        branch  = str(rule["branch_id"])         if rule.get("branch_id")         else None
        subdept = str(rule["sub_department_id"]) if rule.get("sub_department_id") else None
        country = str(rule["country_id"])        if rule.get("country_id")        else None

        # For scope rules resolve designation
        if scope and desig is None:
            desig = SCOPE_TO_DESIG.get(scope)

        key = (scope, desig, dept, branch, subdept, country)
        if key not in seen:
            seen.add(key)
            rows.append({
                "template_id":       template_id,
                "user_id":           None,   # never populated in combinations table
                "scope":             scope,
                "designation_id":    desig,
                "department_id":     dept,
                "branch_id":         branch,
                "country_id":        country,
                "sub_department_id": subdept,
            })

    return rows


def _resolve_matched_users(template_id: int, rules: list, all_users: list) -> list:
    """
    Expand rules into matched user rows for template_assignments.
    Returns rows where user_id is always populated.

    Handles three rule types:
      1. Direct user rules  (rule has user_id)         → stored directly
      2. Scope rules        (rule has scope key)        → matched by designation ± country
      3. Standard rules     (designation + dept combo)  → matched by attribute comparison

    Uses name-based dept/subdept matching for cross-branch consistency.
    """
    try:
        all_depts    = supabase.table("departments").select("id, name, branch_id").execute().data or []
        all_subdepts = supabase.table("sub_departments").select("id, name, department_id").execute().data or []
    except Exception:
        all_depts    = []
        all_subdepts = []

    dept_id_to_name    = {str(d["id"]): d["name"].strip().lower() for d in all_depts}
    subdept_id_to_name = {str(s["id"]): s["name"].strip().lower() for s in all_subdepts}

    rows          = []
    seen_user_ids = set()

    def add_user(user: dict, scope: str | None):
        uid = str(user["id"])
        if uid in seen_user_ids:
            return
        seen_user_ids.add(uid)
        rows.append({
            "template_id":       template_id,
            "user_id":           uid,
            "designation_id":    int(user["designation_id"])    if user.get("designation_id")    else None,
            "department_id":     str(user["department_id"])     if user.get("department_id")     else None,
            "branch_id":         str(user["branch_id"])         if user.get("branch_id")         else None,
            "country_id":        str(user["country_id"])        if user.get("country_id")        else None,
            "sub_department_id": str(user["sub_department_id"]) if user.get("sub_department_id") else None,
            "scope":             scope,
        })

    def user_matches(u: dict, rule_desig, rule_dept_name, rule_subdept_name,
                     rule_branch, rule_country) -> bool:
        u_desig   = int(u["designation_id"])    if u.get("designation_id")    else None
        u_branch  = str(u["branch_id"])         if u.get("branch_id")         else None
        u_country = str(u["country_id"])        if u.get("country_id")        else None
        u_dept_id = str(u["department_id"])     if u.get("department_id")     else None

        if rule_desig  is not None and u_desig  != rule_desig:  return False
        if rule_branch is not None and u_branch != rule_branch:  return False
        if rule_country is not None and u_country is not None and u_country != rule_country: return False

        if rule_dept_name is not None:
            u_dept_name = dept_id_to_name.get(u_dept_id) if u_dept_id else None
            if u_dept_name != rule_dept_name:
                return False

        if rule_subdept_name is not None:
            u_subdept_id   = str(u["sub_department_id"]) if u.get("sub_department_id") else None
            if u_subdept_id:
                u_subdept_name = subdept_id_to_name.get(u_subdept_id)
                if u_subdept_name != rule_subdept_name:
                    return False
            # No sub_department_id on user: still include (sub_dept is best-effort)

        return True

    for rule in rules:
        # ── Direct user assignment ─────────────────────────────────────────────
        if rule.get("user_id"):
            uid = str(rule["user_id"]).strip()
            matched = next((u for u in all_users if str(u["id"]) == uid), None)
            if matched:
                add_user(matched, scope=None)
            elif uid not in seen_user_ids:
                # User not found in master list — store bare row so assignment is not lost
                seen_user_ids.add(uid)
                rows.append({
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

        # ── Scope quick-assign ─────────────────────────────────────────────────
        if rule.get("scope"):
            scope      = rule["scope"]
            country_id = rule.get("country_id") or None
            target     = SCOPE_TO_DESIG.get(scope)
            if target:
                for u in all_users:
                    u_desig = int(u["designation_id"]) if u.get("designation_id") else None
                    if u_desig != target:
                        continue
                    if country_id and str(u.get("country_id") or "") != str(country_id):
                        continue
                    add_user(u, scope=scope)
            continue

        # ── Standard designation + department combination rule ─────────────────
        rule_desig   = int(rule["designation_id"])    if rule.get("designation_id")    else None
        rule_dept    = str(rule["department_id"])     if rule.get("department_id")     else None
        rule_branch  = str(rule["branch_id"])         if rule.get("branch_id")         else None
        rule_subdept = str(rule["sub_department_id"]) if rule.get("sub_department_id") else None
        rule_country = str(rule["country_id"])        if rule.get("country_id")        else None

        if all(v is None for v in [rule_desig, rule_dept, rule_branch, rule_subdept, rule_country]):
            continue

        rule_dept_name    = dept_id_to_name.get(rule_dept)       if rule_dept    else None
        rule_subdept_name = subdept_id_to_name.get(rule_subdept) if rule_subdept else None

        for u in all_users:
            if user_matches(u, rule_desig, rule_dept_name, rule_subdept_name, rule_branch, rule_country):
                add_user(u, scope=None)

    return rows


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
            return jsonify({"error": "Cannot modify assignments — past-cycle template is permanently frozen."}), 403

        rules     = data.get("rules") or []
        all_users = supabase.table("users").select(
            "id, designation_id, department_id, branch_id, country_id, sub_department_id"
        ).execute().data

        # Deduplicate users by id to prevent duplicate assignment rows
        seen_ids   = set()
        unique_users = []
        for u in all_users:
            uid = str(u["id"])
            if uid not in seen_ids:
                seen_ids.add(uid)
                unique_users.append(u)
        all_users = unique_users

        # Build logical rule rows (for template_assignment_combinations)
        # NOTE: direct user rules are excluded from this table
        rule_rows = _build_rule_rows(template_id, rules)

        # Build matched user rows (for template_assignments — user_id always set)
        # NOTE: direct user rules ARE included here
        user_rows = _resolve_matched_users(template_id, rules, all_users)

        # Write rules to template_assignment_combinations (no direct user rows)
        supabase.table("template_assignment_combinations").delete().eq("template_id", template_id).execute()
        if rule_rows:
            supabase.table("template_assignment_combinations").insert(rule_rows).execute()

        # Write user assignments to template_assignments (all matched + direct users)
        supabase.table("template_assignments").delete().eq("template_id", template_id).execute()
        if user_rows:
            supabase.table("template_assignments").insert(user_rows).execute()

        return jsonify({
            "message":        "Template assigned successfully",
            "rules_stored":   len(rule_rows),
            "users_matched":  len(user_rows),
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/assign-template", methods=["POST"])
def assign_template():
    return _do_assign_template()


@app.route("/templates/<int:template_id>/assign", methods=["POST"])
def assign_template_by_id(template_id):
    return _do_assign_template()


# ─────────────────────────────────────────────────────────────────────────────
# MY TEMPLATES — returns variant if one exists for user's branch/country
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/my-templates", methods=["GET"])
def get_my_templates():
    try:
        user_id = request.args.get("user_id", "").strip()
        if not user_id:
            return jsonify({"error": "user_id is required"}), 400

        assignments  = supabase.table("template_assignments").select("template_id").eq("user_id", user_id).execute().data
        template_ids = list(set(a["template_id"] for a in assignments))
        if not template_ids:
            return jsonify([]), 200

        user_data = supabase.table("users").select("branch_id, country_id").eq("id", user_id).single().execute().data
        user_branch_id  = str(user_data["branch_id"])  if user_data and user_data.get("branch_id")  else None
        user_country_id = str(user_data["country_id"]) if user_data and user_data.get("country_id") else None

        active   = get_active_pms_cycle()
        cycle_id = active["id"] if active else None

        templates = supabase.table("templates").select("*").in_("id", template_ids).execute().data
        result    = []

        for t in templates:
            if "template_content" in t:
                t["categories"] = t.pop("template_content")
            if t.get("max_score") is None:
                t["max_score"] = DEFAULT_MAX_SCORE

            variant = None
            if cycle_id and user_branch_id:
                variant = get_variant_for_branch(t["id"], user_branch_id, cycle_id)
            if not variant and cycle_id and user_country_id:
                variant = get_variant_for_country(t["id"], user_country_id, cycle_id)

            if variant:
                t["categories"]    = variant.get("template_content") or t.get("categories")
                t["description"]   = variant.get("description")      or t.get("description")
                t["max_score"]     = variant.get("max_score")        or t.get("max_score")
                t["total_weight"]  = variant.get("total_weight")     or t.get("total_weight")
                t["has_variant"]   = True
                t["variant_id"]    = variant["id"]
                t["variant_scope"] = "branch" if variant.get("branch_id") else "country"
            else:
                t["has_variant"]   = False
                t["variant_id"]    = None
                t["variant_scope"] = None

            result.append(t)

        return jsonify(result), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# DESIGNATIONS / DEPARTMENTS / USERS
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/designations", methods=["GET"])
def get_designations():
    try:
        return jsonify(supabase.table("designations").select("*").order("name").execute().data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/designations", methods=["POST"])
def create_designation():
    try:
        data = request.get_json()
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"error": "Designation name is required"}), 400
        if supabase.table("designations").select("id").ilike("name", name).execute().data:
            return jsonify({"error": f"Designation '{name}' already exists."}), 409
        result = supabase.table("designations").insert({"name": name}).execute()
        return jsonify(result.data[0]), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/departments", methods=["GET"])
def get_departments():
    try:
        return jsonify(supabase.table("departments").select("id, name, code, branch_id, country_id").order("name").execute().data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/departments", methods=["POST"])
def create_department():
    try:
        data      = request.get_json()
        name      = (data.get("name") or "").strip()
        code      = (data.get("code") or "").strip().upper()
        branch_id = data.get("branch_id") or None
        if not name: return jsonify({"error": "Department name is required"}), 400
        if not code: return jsonify({"error": "Department code is required"}), 400
        if supabase.table("departments").select("id").eq("code", code).execute().data:
            return jsonify({"error": f"Department code '{code}' already exists."}), 409
        result = supabase.table("departments").insert({
            "name": name, "code": code, "branch_id": branch_id,
            "created_at": datetime.now().isoformat(), "updated_at": datetime.now().isoformat(),
        }).execute()
        return jsonify(result.data[0]), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/users", methods=["GET"])
def get_users():
    try:
        all_users = supabase.table("users").select(
            "id, full_name, department_id, branch_id, sub_department_id, country_id, designation_id"
        ).order("full_name").execute().data

        # Deduplicate by id in case of data anomalies — keeps the first occurrence
        seen_ids     = set()
        unique_users = []
        for user in all_users:
            uid = str(user["id"])
            if uid not in seen_ids:
                seen_ids.add(uid)
                unique_users.append(user)

        return jsonify(unique_users), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# APP STARTUP
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    fix_duplicate_active_cycles()
    sync_cycle_dates_from_constants()
    start_scheduler()
    app.run(debug=True)