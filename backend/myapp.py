"""
app.py — PMS Template Management Backend

Changes in this version:
  - Training linkage removed from templates entirely.
  - max_score removed from BasicInfo form concept; per-objective kpiMaxScore
    takes precedence, with the template-level max_score as the fallback default.
  - assign_template fixed: employee + role/dept combinations all persist correctly.
  - PMS cycle management routes: /pms-cycles/close and /pms-cycles/open-next.
  - sync_cycle_dates_from_constants() runs on startup: changing constants in
    app.py automatically pushes recomputed dates to the active DB cycle so
    freeze logic always reflects the latest constants without manual SQL.
  - employees table replaced with users table (id=uuid, full_name=text).
    template_assignments.user_id maps to users.id (uuid).
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
from supabase import create_client, Client
from datetime import date, datetime, timedelta
from dateutil.relativedelta import relativedelta

app = Flask(__name__)
CORS(app)

# ── Supabase credentials ──────────────────────────────────────────────────────
SUPABASE_URL = "https://zupcupoagfxhnfsbhpmu.supabase.co"
SUPABASE_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1cGN1cG9hZ2Z4aG5mc2JocG11Iiw"
    "icm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMjA3ODksImV4cCI6MjA4Njc5Njc4OX0"
    ".Vmk27ISy7gniK_J_2lUVSN3nDnRalf0Y253S2tSOnvU"
)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Freeze constants (mirror lib/freezeConfig.ts exactly) ────────────────────
OBJECTIVE_SETTING_MONTHS = 12
GRACE_PERIOD_DAYS        = 15
PMS_START_MONTH          = 7
PMS_START_DAY            = 1
DEFAULT_MAX_SCORE        = 5


# ─────────────────────────────────────────────────────────────────────────────
# STARTUP SYNC
# ─────────────────────────────────────────────────────────────────────────────

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
            print("⚠️  sync_cycle_dates_from_constants: no active cycle found — skipping.")
            return

        cycle     = result.data[0]
        pms_start = datetime.fromisoformat(cycle["pms_start"]).date()

        objective_end = pms_start + relativedelta(months=OBJECTIVE_SETTING_MONTHS)
        grace_end     = objective_end + timedelta(days=GRACE_PERIOD_DAYS)

        supabase.table("pms_cycles").update({
            "objective_setting_end": objective_end.isoformat(),
            "grace_period_end":      grace_end.isoformat(),
        }).eq("id", cycle["id"]).execute()

        print(
            f"✅ sync_cycle_dates_from_constants: cycle {cycle['pms_year']} updated → "
            f"objective_end={objective_end}, grace_end={grace_end}"
        )

    except Exception as error:
        print(f"❌ sync_cycle_dates_from_constants failed: {error}")


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
            "objective_end":    dates["objective_end"].isoformat(),
            "grace_end":        dates["grace_end"].isoformat(),
            "grace_period_end": dates["grace_end"].isoformat(),
            "freeze_status":    get_freeze_status(),
            "source":           "database",
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
            "name":          data.get("name"),
            "description":   data.get("description"),
            "max_score":     data.get("max_score", DEFAULT_MAX_SCORE),
            "categories":    data.get("categories"),
            "total_weight":  data.get("totalWeight"),
            "pms_cycle_id":  cycle_id,
            "status":        "active",
            "created_at":    now,
            "lastModified":  now,
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
        templates   = supabase.table("templates").select("*").execute().data
        mapping     = supabase.table("template_assignments").select("*").execute().data
        roles       = supabase.table("roles").select("*").execute().data
        departments = supabase.table("departments").select("*").execute().data
        # ── Changed: query users table (id uuid, full_name text) ──────────────
        users       = supabase.table("users").select("id, full_name").execute().data

        for template in templates:
            t_id = template["id"]

            assigned_role_ids = list(set([
                m["role_id"] for m in mapping
                if m["template_id"] == t_id and m.get("role_id")
            ]))
            assigned_dept_ids = list(set([
                m["department_id"] for m in mapping
                if m["template_id"] == t_id and m.get("department_id")
            ]))
            # ── Changed: read user_id (uuid) instead of emp_id ───────────────
            assigned_user_ids = list(set([
                m["user_id"] for m in mapping
                if m["template_id"] == t_id and m.get("user_id")
            ]))

            template["assignedRoles"]          = [r["name"] for r in roles if r["id"] in assigned_role_ids]
            template["assignedRolesIds"]       = assigned_role_ids
            template["assignedDepartments"]    = [d["name"] for d in departments if d["id"] in assigned_dept_ids]
            template["assignedDepartmentsIds"] = assigned_dept_ids
            # ── Changed: display full_name, store uuid ids ────────────────────
            template["assignedEmployees"]      = [
                u["full_name"] for u in users if u["id"] in assigned_user_ids
            ]
            template["assignedEmployeeIds"]    = assigned_user_ids

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
            "name":         data.get("name"),
            "description":  data.get("description"),
            "max_score":    data.get("max_score", DEFAULT_MAX_SCORE),
            "categories":   data.get("categories"),
            "total_weight": data.get("totalWeight"),
            "lastModified": now,
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
# MY-TEMPLATES ROUTE (Employee / User view)
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/my-templates", methods=["GET"])
def get_my_templates():
    """
    Returns templates assigned to the requesting user.
    Lookup priority: direct user assignment → role → department.

    Query param: user_id (uuid string) — the users.id value.
    """
    try:
        # ── Changed: accept user_id (uuid) instead of emp_id string ──────────
        user_id_param = request.args.get("user_id", "").strip()
        if not user_id_param:
            return jsonify({"error": "user_id query parameter is required"}), 400

        # ── Changed: query users table by id (uuid), fetch full_name ─────────
        user_result = (
            supabase.table("users")
            .select("id, full_name, role_id, department_id")
            .eq("id", user_id_param)
            .execute()
        )

        if not user_result.data:
            return jsonify({
                "error": f"No user found with id '{user_id_param}'."
            }), 404

        user          = user_result.data[0]
        user_pk       = user["id"]          # uuid
        role_id       = user.get("role_id")
        department_id = user.get("department_id")

        all_assignments = supabase.table("template_assignments").select("*").execute().data

        matched_template_ids: set = set()
        for assignment in all_assignments:
            # ── Changed: match on user_id column (uuid) ───────────────────────
            if assignment.get("user_id") == user_pk:
                matched_template_ids.add(assignment["template_id"])
                continue
            if role_id and assignment.get("role_id") == role_id:
                matched_template_ids.add(assignment["template_id"])
                continue
            if department_id and assignment.get("department_id") == department_id:
                matched_template_ids.add(assignment["template_id"])
                continue

        if not matched_template_ids:
            return jsonify([]), 200

        all_templates = supabase.table("templates").select("*").execute().data
        my_templates  = [t for t in all_templates if t["id"] in matched_template_ids]

        return jsonify(my_templates), 200
    except Exception as error:
        return jsonify({"error": str(error)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# ASSIGNMENT ROUTE
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/assign-template", methods=["POST"])
def assign_template():
    """
    Assigns a template to roles, departments, and/or a specific user.

    Frontend sends:
      - template_id   (int)
      - role_ids      (list of ints)
      - department_ids(list of ints)
      - user_id       (uuid string — users.id)   ← was emp_id / emp_id_code

    template_assignments columns used:
      - template_id   (int)
      - role_id       (int, nullable)
      - department_id (int, nullable)
      - user_id       (uuid, nullable)            ← was emp_id (int)
    """
    try:
        level = get_request_level()
        if not can_role_edit(level):
            return jsonify({"error": "Cannot assign — template is frozen."}), 403

        data        = request.get_json()
        template_id = data.get("template_id")
        role_ids    = data.get("role_ids", [])
        dept_ids    = data.get("department_ids", [])
        # ── Changed: frontend sends user_id (uuid string) ────────────────────
        user_id_raw = data.get("user_id")

        if not template_id:
            return jsonify({"error": "template_id is required"}), 400

        # Clear old assignments for this template
        supabase.table("template_assignments").delete().eq("template_id", template_id).execute()

        assign_rows: list = []

        # ── Resolve / validate user uuid if provided ──────────────────────────
        resolved_user_id = None
        if user_id_raw is not None and str(user_id_raw).strip() != "":
            candidate = str(user_id_raw).strip()

            # ── Changed: look up users table by id (uuid) ─────────────────────
            user_result = (
                supabase.table("users")
                .select("id")
                .eq("id", candidate)
                .execute()
            )

            if not user_result.data:
                return jsonify({
                    "error": (
                        f"User with id '{candidate}' not found. "
                        f"Make sure the uuid matches what is stored in the users table."
                    )
                }), 404

            resolved_user_id = user_result.data[0]["id"]   # uuid string

        # ── Build assignment rows (same case logic, column name changed) ──────
        if resolved_user_id and role_ids and dept_ids:
            assign_rows.append({
                "template_id": template_id,
                "user_id":     resolved_user_id,
            })
            for role_id in role_ids:
                for dept_id in dept_ids:
                    assign_rows.append({
                        "template_id":   template_id,
                        "role_id":       role_id,
                        "department_id": dept_id,
                    })

        elif resolved_user_id and role_ids and not dept_ids:
            assign_rows.append({
                "template_id": template_id,
                "user_id":     resolved_user_id,
            })
            for role_id in role_ids:
                assign_rows.append({
                    "template_id": template_id,
                    "role_id":     role_id,
                })

        elif resolved_user_id and dept_ids and not role_ids:
            assign_rows.append({
                "template_id": template_id,
                "user_id":     resolved_user_id,
            })
            for dept_id in dept_ids:
                assign_rows.append({
                    "template_id":   template_id,
                    "department_id": dept_id,
                })

        elif resolved_user_id and not role_ids and not dept_ids:
            assign_rows.append({
                "template_id": template_id,
                "user_id":     resolved_user_id,
            })

        elif not resolved_user_id and role_ids and dept_ids:
            for role_id in role_ids:
                for dept_id in dept_ids:
                    assign_rows.append({
                        "template_id":   template_id,
                        "role_id":       role_id,
                        "department_id": dept_id,
                    })

        elif not resolved_user_id and role_ids and not dept_ids:
            for role_id in role_ids:
                assign_rows.append({
                    "template_id": template_id,
                    "role_id":     role_id,
                })

        elif not resolved_user_id and dept_ids and not role_ids:
            for dept_id in dept_ids:
                assign_rows.append({
                    "template_id":   template_id,
                    "department_id": dept_id,
                })

        if assign_rows:
            supabase.table("template_assignments").insert(assign_rows).execute()

        return jsonify({"message": "Template assigned successfully"}), 200
    except Exception as error:
        return jsonify({"error": str(error)}), 400


# ─────────────────────────────────────────────────────────────────────────────
# ROLE / DEPARTMENT ROUTES  (unchanged)
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/roles", methods=["GET"])
def get_roles():
    try:
        return jsonify(supabase.table("roles").select("*").execute().data), 200
    except Exception as error:
        return jsonify({"error": str(error)}), 400


@app.route("/roles", methods=["POST"])
def add_role():
    try:
        name = request.json.get("name")
        if not name:
            return jsonify({"error": "Name required"}), 400
        result = supabase.table("roles").insert({"name": name}).execute()
        return jsonify(result.data[0]), 200
    except Exception as error:
        return jsonify({"error": str(error)}), 400


@app.route("/departments", methods=["GET"])
def get_departments():
    try:
        return jsonify(supabase.table("departments").select("*").execute().data), 200
    except Exception as error:
        return jsonify({"error": str(error)}), 400


@app.route("/departments", methods=["POST"])
def add_department():
    try:
        name = request.json.get("name")
        if not name:
            return jsonify({"error": "Name required"}), 400
        result = supabase.table("departments").insert({"name": name}).execute()
        return jsonify(result.data[0]), 200
    except Exception as error:
        return jsonify({"error": str(error)}), 400


# ── Changed: /users replaces /employees ──────────────────────────────────────
# Returns id (uuid) and full_name from the users table.
# The /employees POST route is removed — users are managed externally.

@app.route("/users", methods=["GET"])
def get_users():
    """
    Returns all users with id (uuid) and full_name.
    Used by the frontend employee-selection dropdown.
    """
    try:
        return jsonify(
            supabase.table("users").select("id, full_name").execute().data
        ), 200
    except Exception as error:
        return jsonify({"error": str(error)}), 400


# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    sync_cycle_dates_from_constants()
    app.run(debug=True, port=5000)
