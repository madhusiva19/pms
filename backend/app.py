from flask import Flask, request, jsonify
from flask_cors import CORS
from supabase import create_client, Client
from dotenv import load_dotenv
from datetime import datetime, timezone
import os
import re
from werkzeug.security import generate_password_hash, check_password_hash

load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:3000"]}})

# ── Supabase client ──────────────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Dummy users (replace with MS AD later) ──────────────────────────────────
USERS = {
    "hqadmin@dgl.com": {
        "password_hash": generate_password_hash("HQ@123"),
        "role": "HQ Admin",
        "full_name": "HQ Admin User",
        "employee_id": "emp-001",
        "org_level": 1,
        "iata_branch_code": "HQ"
    },
    "countryadmin@dgl.com": {
        "password_hash": generate_password_hash("Country@123"),
        "role": "Country Admin",
        "full_name": "Country Admin User",
        "employee_id": "emp-002",
        "org_level": 2,
        "iata_branch_code": "CMB"
    },
    "branchadmin@dgl.com": {
        "password_hash": generate_password_hash("Branch@123"),
        "role": "Branch Admin",
        "full_name": "Branch Admin User",
        "employee_id": "emp-003",
        "org_level": 3,
        "iata_branch_code": "CMB"
    },
    "deptadmin@dgl.com": {
        "password_hash": generate_password_hash("Dept@123"),
        "role": "Dept Admin",
        "full_name": "Dept Admin User",
        "employee_id": "emp-004",
        "org_level": 4,
        "iata_branch_code": "CMB"
    },
    "subdeptadmin@dgl.com": {
        "password_hash": generate_password_hash("Subdept@123"),
        "role": "Sub Dept Admin",
        "full_name": "Sub Dept Admin User",
        "employee_id": "emp-005",
        "org_level": 5,
        "iata_branch_code": "CMB"
    },
    "employee@dgl.com": {
        "password_hash": generate_password_hash("Emp@123"),
        "role": "Employee",
        "full_name": "Employee User",
        "employee_id": "emp-006",
        "org_level": 6,
        "iata_branch_code": "CMB"
    },
}

# ── Role redirects after login ───────────────────────────────────────────────
ROLE_REDIRECTS = {
    "HQ Admin":       "/hq-admin/dashboard",
    "Country Admin":  "/country-admin/dashboard",
    "Branch Admin":   "/branch-admin/dashboard",
    "Dept Admin":     "/dept-admin/dashboard",
    "Sub Dept Admin": "/sub-dept-admin/dashboard",
    "Employee":       "/employee/profile",
}

# ── Role profile paths (used for notification action URLs) ───────────────────
ROLE_PROFILE_PATHS = {
    1: "/hq-admin/profile",
    2: "/country-admin/profile",
    3: "/branch-admin/profile",
    4: "/dept-admin/profile",
    5: "/sub-dept-admin/profile",
    6: "/employee/profile",
}

# ── Helper ───────────────────────────────────────────────────────────────────
def is_valid_email(email):
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None


# ════════════════════════════════════════════════════════════════════════════
# SYSTEM ROUTES
# ════════════════════════════════════════════════════════════════════════════

@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "service": "pms-backend"}), 200


@app.get("/api/test-db")
def test_db():
    try:
        result = supabase.table("employees").select("*").execute()
        return jsonify({"status": "connected", "employees": result.data}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.get("/api/debug-env")
def debug_env():
    return jsonify({
        "url": os.getenv("SUPABASE_URL"),
        "key_exists": bool(os.getenv("SUPABASE_KEY"))
    }), 200


# ════════════════════════════════════════════════════════════════════════════
# AUTH ROUTES
# ════════════════════════════════════════════════════════════════════════════

@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"message": "Email and password are required"}), 400
    if not is_valid_email(email):
        return jsonify({"message": "Invalid email format"}), 400

    user = USERS.get(email)
    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"message": "Invalid email or password"}), 401

    return jsonify({
        "message":        "Login successful",
        "employee_id":    user["employee_id"],
        "full_name":      user["full_name"],
        "email":          email,
        "org_level":      user["org_level"],
        "role":           user["role"],
        "iata_branch_code": user["iata_branch_code"],
        "redirectTo":     ROLE_REDIRECTS.get(user["role"])
    }), 200


# ════════════════════════════════════════════════════════════════════════════
# PROFILE ROUTES
# ════════════════════════════════════════════════════════════════════════════

# Get any employee's profile by employee_id
@app.get("/api/profile/<employee_id>")
def get_profile(employee_id):
    try:
        result = supabase.table("employees")\
            .select("*")\
            .eq("employee_id", employee_id)\
            .execute()

        if not result.data:
            return jsonify({"message": "Employee not found"}), 404

        return jsonify({"profile": result.data[0]}), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500


# ════════════════════════════════════════════════════════════════════════════
# PERFORMANCE DIARY ROUTES
# ════════════════════════════════════════════════════════════════════════════

# Get diary entries for an employee (both self and supervisor)
@app.get("/api/diary/<employee_id>")
def get_diary(employee_id):
    try:
        self_entries = supabase.table("performance_diary")\
            .select("*")\
            .eq("employee_id", employee_id)\
            .eq("author_type", "self")\
            .order("created_at", desc=True)\
            .execute()

        supervisor_entries = supabase.table("performance_diary")\
            .select("*")\
            .eq("employee_id", employee_id)\
            .eq("author_type", "supervisor")\
            .order("created_at", desc=True)\
            .execute()

        return jsonify({
            "self_entries":       self_entries.data,
            "supervisor_entries": supervisor_entries.data
        }), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500


# Save diary entry directly — HQ Admin only (no approval needed)
@app.post("/api/diary/save")
def save_diary():
    data = request.get_json(silent=True) or {}
    employee_id = (data.get("employee_id") or "").strip()
    description = (data.get("description") or "").strip()
    entry_date  = (data.get("entry_date") or "").strip()
    cycle_id    = (data.get("cycle_id") or "").strip()

    if not employee_id or not description or not entry_date:
        return jsonify({"message": "employee_id, description and entry_date are required"}), 400

    try:
        result = supabase.table("performance_diary").insert({
            "employee_id": employee_id,
            "author_id":   employee_id,
            "author_type": "self",
            "entry_date":  entry_date,
            "description": description,
            "cycle_id":    cycle_id or None,
            "status":      "approved"
        }).execute()

        return jsonify({
            "message": "Diary entry saved",
            "data": result.data[0] if result.data else {}
        }), 201

    except Exception as e:
        return jsonify({"message": str(e)}), 500


# Submit diary entry for supervisor approval — all roles except HQ Admin
@app.post("/api/diary/submit")
def submit_diary():
    data = request.get_json(silent=True) or {}
    employee_id = (data.get("employee_id") or "").strip()
    description = (data.get("description") or "").strip()
    entry_date  = (data.get("entry_date") or "").strip()
    cycle_id    = (data.get("cycle_id") or "").strip()

    if not employee_id or not description or not entry_date:
        return jsonify({"message": "employee_id, description and entry_date are required"}), 400

    try:
        # Save diary entry with pending status
        result = supabase.table("performance_diary").insert({
            "employee_id": employee_id,
            "author_id":   employee_id,
            "author_type": "self",
            "entry_date":  entry_date,
            "description": description,
            "cycle_id":    cycle_id or None,
            "status":      "pending"
        }).execute()

        # Find supervisor to notify
        employee = supabase.table("employees")\
            .select("full_name, org_level, supervisor_id")\
            .eq("employee_id", employee_id)\
            .execute()

        if employee.data:
            emp = employee.data[0]
            supervisor_id = emp.get("supervisor_id")
            full_name     = emp.get("full_name")

            if supervisor_id:
                # Get supervisor org_level for correct profile path
                supervisor = supabase.table("employees")\
                    .select("org_level")\
                    .eq("employee_id", supervisor_id)\
                    .execute()

                if supervisor.data:
                    supervisor_level = supervisor.data[0]["org_level"]
                    base_path  = ROLE_PROFILE_PATHS.get(supervisor_level, "/")
                    action_url = f"{base_path}?employee_id={employee_id}"

                    # Notify supervisor
                    supabase.table("notifications").insert({
                        "recipient_id": supervisor_id,
                        "type":         "diary_approval",
                        "title":        full_name,
                        "message":      description,
                        "triggered_by": "system",
                        "action_url":   action_url,
                    }).execute()

        return jsonify({
            "message": "Diary entry submitted for approval",
            "data": result.data[0] if result.data else {}
        }), 201

    except Exception as e:
        return jsonify({"message": str(e)}), 500


# Supervisor adds diary comment directly — no approval needed
@app.post("/api/diary/supervisor")
def add_supervisor_diary():
    data = request.get_json(silent=True) or {}
    employee_id   = (data.get("employee_id") or "").strip()
    supervisor_id = (data.get("supervisor_id") or "").strip()
    description   = (data.get("description") or "").strip()
    entry_date    = (data.get("entry_date") or "").strip()
    cycle_id      = (data.get("cycle_id") or "").strip()

    if not employee_id or not supervisor_id or not description or not entry_date:
        return jsonify({"message": "All fields are required"}), 400

    try:
        result = supabase.table("performance_diary").insert({
            "employee_id": employee_id,
            "author_id":   supervisor_id,
            "author_type": "supervisor",
            "entry_date":  entry_date,
            "description": description,
            "cycle_id":    cycle_id or None,
            "status":      "approved"
        }).execute()

        return jsonify({
            "message": "Supervisor comment added",
            "data": result.data[0] if result.data else {}
        }), 201

    except Exception as e:
        return jsonify({"message": str(e)}), 500


# Approve a diary entry — supervisor action
@app.patch("/api/diary/<diary_id>/approve")
def approve_diary(diary_id):
    data = request.get_json(silent=True) or {}
    reviewer_id = (data.get("reviewer_id") or "").strip()

    try:
        # Update diary status to approved
        supabase.table("performance_diary")\
            .update({
                "status":      "approved",
                "reviewed_by": reviewer_id,
                "reviewed_at": datetime.now(timezone.utc).isoformat()
            })\
            .eq("diary_id", diary_id)\
            .execute()

        # Get diary entry to find employee
        diary = supabase.table("performance_diary")\
            .select("employee_id, description")\
            .eq("diary_id", diary_id)\
            .execute()

        if diary.data:
            employee_id = diary.data[0]["employee_id"]
            description = diary.data[0]["description"]

            # Get employee org_level for notification action URL
            employee = supabase.table("employees")\
                .select("org_level")\
                .eq("employee_id", employee_id)\
                .execute()

            org_level  = employee.data[0]["org_level"] if employee.data else 6
            action_url = ROLE_PROFILE_PATHS.get(org_level, "/")

            # Notify employee of approval
            supabase.table("notifications").insert({
                "recipient_id": employee_id,
                "type":         "diary_approval",
                "title":        "Achievement Approved ✅",
                "message":      f"Your diary entry has been approved: {description[:100]}",
                "triggered_by": "system",
                "action_url":   action_url,
            }).execute()

        return jsonify({"message": "Diary entry approved"}), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500


# Reject a diary entry — supervisor action
@app.patch("/api/diary/<diary_id>/reject")
def reject_diary(diary_id):
    data = request.get_json(silent=True) or {}
    reviewer_id = (data.get("reviewer_id") or "").strip()

    try:
        # Update diary status to rejected
        supabase.table("performance_diary")\
            .update({
                "status":      "rejected",
                "reviewed_by": reviewer_id,
                "reviewed_at": datetime.now(timezone.utc).isoformat()
            })\
            .eq("diary_id", diary_id)\
            .execute()

        # Get diary entry to find employee
        diary = supabase.table("performance_diary")\
            .select("employee_id, description")\
            .eq("diary_id", diary_id)\
            .execute()

        if diary.data:
            employee_id = diary.data[0]["employee_id"]
            description = diary.data[0]["description"]

            # Get employee org_level for notification action URL
            employee = supabase.table("employees")\
                .select("org_level")\
                .eq("employee_id", employee_id)\
                .execute()

            org_level  = employee.data[0]["org_level"] if employee.data else 6
            action_url = ROLE_PROFILE_PATHS.get(org_level, "/")

            # Notify employee of rejection
            supabase.table("notifications").insert({
                "recipient_id": employee_id,
                "type":         "diary_approval",
                "title":        "Achievement Rejected ❌",
                "message":      f"Your diary entry was not approved: {description[:100]}",
                "triggered_by": "system",
                "action_url":   action_url,
            }).execute()

        return jsonify({"message": "Diary entry rejected"}), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500


# Delete a diary entry — HQ Admin only
@app.delete("/api/diary/<diary_id>")
def delete_diary(diary_id):
    try:
        supabase.table("performance_diary")\
            .delete()\
            .eq("diary_id", diary_id)\
            .execute()
        return jsonify({"message": "Entry deleted"}), 200
    except Exception as e:
        return jsonify({"message": str(e)}), 500


# ════════════════════════════════════════════════════════════════════════════
# NOTIFICATION ROUTES
# ════════════════════════════════════════════════════════════════════════════

# Get all notifications for an employee
@app.get("/api/notifications/<employee_id>")
def get_notifications(employee_id):
    try:
        result = supabase.table("notifications")\
            .select("*")\
            .eq("recipient_id", employee_id)\
            .order("created_at", desc=True)\
            .execute()

        return jsonify({"notifications": result.data}), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500


# Mark a notification as read
@app.patch("/api/notifications/<notification_id>/read")
def mark_notification_read(notification_id):
    try:
        supabase.table("notifications")\
            .update({
                "is_read": True,
                "read_at": datetime.now(timezone.utc).isoformat()
            })\
            .eq("notification_id", notification_id)\
            .execute()

        return jsonify({"message": "Marked as read"}), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500


# ════════════════════════════════════════════════════════════════════════════
# TRAINING PASSPORT ROUTES
# ════════════════════════════════════════════════════════════════════════════

# Get all training records attended by an employee
@app.get("/api/training/attended/<employee_id>")
def get_training_attended(employee_id):
    try:
        result = supabase.table("training_attended")\
            .select("*")\
            .eq("employee_id", employee_id)\
            .order("training_date", desc=True)\
            .execute()

        return jsonify({"trainings": result.data}), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500


# Add a new training attended record
@app.post("/api/training/attended")
def add_training_attended():
    data = request.get_json(silent=True) or {}
    employee_id      = (data.get("employee_id") or "").strip()
    programme_name   = (data.get("programme_name") or "").strip()
    training_date    = (data.get("training_date") or "").strip()
    trainer_provider = (data.get("trainer_provider") or "").strip()
    cycle_id         = (data.get("cycle_id") or "").strip()

    if not employee_id or not programme_name or not training_date or not trainer_provider:
        return jsonify({"message": "All fields are required"}), 400

    try:
        result = supabase.table("training_attended").insert({
            "employee_id":      employee_id,
            "programme_name":   programme_name,
            "training_date":    training_date,
            "trainer_provider": trainer_provider,
            "cycle_id":         cycle_id or None,
        }).execute()

        return jsonify({
            "message": "Training record added",
            "data": result.data[0] if result.data else {}
        }), 201

    except Exception as e:
        return jsonify({"message": str(e)}), 500


# Get training needs checklist for an employee
@app.get("/api/training/needs/<employee_id>")
def get_training_needs(employee_id):
    try:
        result = supabase.table("training_needs")\
            .select("*")\
            .eq("employee_id", employee_id)\
            .execute()

        return jsonify({"needs": result.data}), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500


# ── Training Suggestions ─────────────────────────────────────────────────────

# Submit a new training suggestion (employee → supervisor)
@app.post("/api/training/suggestions")
def add_training_suggestion():
    data = request.get_json(silent=True) or {}
    employee_id   = (data.get("employee_id") or "").strip()
    training_name = (data.get("training_name") or "").strip()
    justification = (data.get("justification") or "").strip()

    if not employee_id or not training_name or not justification:
        return jsonify({"message": "All fields are required"}), 400

    try:
        # Get supervisor_id from employees table
        employee = supabase.table("employees")\
            .select("supervisor_id, full_name")\
            .eq("employee_id", employee_id)\
            .execute()

        supervisor_id = None
        if employee.data:
            supervisor_id = employee.data[0].get("supervisor_id")

        result = supabase.table("training_suggestions").insert({
            "employee_id":   employee_id,
            "supervisor_id": supervisor_id,
            "training_name": training_name,
            "justification": justification,
            "status":        "pending",
        }).execute()

        return jsonify({
            "message": "Suggestion submitted",
            "data": result.data[0] if result.data else {}
        }), 201

    except Exception as e:
        return jsonify({"message": str(e)}), 500


# Get own training suggestions for an employee
@app.get("/api/training/suggestions/<employee_id>")
def get_training_suggestions(employee_id):
    try:
        result = supabase.table("training_suggestions")\
            .select("*")\
            .eq("employee_id", employee_id)\
            .order("created_at", desc=True)\
            .execute()

        return jsonify({"suggestions": result.data}), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500


# Get pending suggestions submitted by subordinates (for supervisor review)
@app.get("/api/training/subordinate-suggestions/<supervisor_id>")
def get_subordinate_suggestions(supervisor_id):
    try:
        result = supabase.table("training_suggestions")\
            .select("*, employees!training_suggestions_employee_id_fkey(full_name, role)")\
            .eq("supervisor_id", supervisor_id)\
            .eq("status", "pending")\
            .order("created_at", desc=True)\
            .execute()

        return jsonify({"suggestions": result.data}), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500


# Approve or reject a training suggestion — supervisor action
@app.patch("/api/training/suggestions/<suggestion_id>")
def review_suggestion(suggestion_id):
    data = request.get_json(silent=True) or {}
    action  = (data.get("action") or "").strip()
    comment = (data.get("comment") or "").strip()

    if action not in ("approved", "rejected"):
        return jsonify({"message": "Action must be approved or rejected"}), 400

    try:
        supabase.table("training_suggestions")\
            .update({
                "status":             action,
                "supervisor_comment": comment,
                "updated_at":         datetime.now(timezone.utc).isoformat()
            })\
            .eq("suggestion_id", suggestion_id)\
            .execute()

        return jsonify({"message": f"Suggestion {action}"}), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500


# ════════════════════════════════════════════════════════════════════════════
# RUN SERVER — MUST BE LAST
# ════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)