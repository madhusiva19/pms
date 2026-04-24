from flask import Flask, request, jsonify
from flask_cors import CORS

from dotenv import load_dotenv
from datetime import datetime, timezone
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import os
import re
from werkzeug.security import generate_password_hash, check_password_hash

load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:3000"]}})

# ── Supabase client ──────────────────────────────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

import requests as req

class SupabaseClient:
    def __init__(self, url, key):
        self.url = url
        self.key = key
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }

    def table(self, table_name):
        return SupabaseTable(self.url, self.headers, table_name)

class SupabaseTable:
    def __init__(self, url, headers, table_name):
        self.url = url
        self.headers = headers
        self.table_name = table_name
        self.params = {}
        self.method = "GET"
        self.body = None
        self._count = None

    def select(self, columns="*", count=None):
        self.params["select"] = columns
        if count == "exact":
            self.headers = {**self.headers, "Prefer": "count=exact"}
            self._count = True
        return self

    def insert(self, data):
        self.method = "POST"
        self.body = data
        return self

    def update(self, data):
        self.method = "PATCH"
        self.body = data
        return self

    def delete(self):
        self.method = "DELETE"
        return self

    def eq(self, col, val):
        self.params[col] = f"eq.{val}"
        return self

    def order(self, col, desc=False):
        self.params["order"] = f"{col}.{'desc' if desc else 'asc'}"
        return self

    def execute(self):
        url = f"{self.url}/rest/v1/{self.table_name}"
        if self.method == "GET":
            res = req.get(url, headers=self.headers, params=self.params)
        elif self.method == "POST":
            res = req.post(url, headers=self.headers, json=self.body)
        elif self.method == "PATCH":
            res = req.patch(url, headers=self.headers, params=self.params, json=self.body)
        elif self.method == "DELETE":
            res = req.delete(url, headers=self.headers, params=self.params)

        class Result:
            pass

        result = Result()
        try:
            result.data = res.json() if res.text else []
            if not isinstance(result.data, list):
                result.data = [result.data] if result.data else []
        except:
            result.data = []

        # Handle count
        if self._count:
            content_range = res.headers.get("Content-Range", "")
            try:
                result.count = int(content_range.split("/")[-1])
            except:
                result.count = len(result.data)
        else:
            result.count = len(result.data)

        return result

supabase = SupabaseClient(SUPABASE_URL, SUPABASE_KEY)

# ── Dummy users ──────────────────────────────────────────────────────────────
USERS = {
    "hqadmin@dgl.com": {
        "password_hash": generate_password_hash("HQ@123"),
        "role": "HQ Admin",
        "full_name": "HQ Admin User",
        "employee_id": "00000000-0000-0000-0000-000000000001",
        "org_level": 1,
        "iata_branch_code": "HQ"
    },
    "countryadmin@dgl.com": {
        "password_hash": generate_password_hash("Country@123"),
        "role": "Country Admin",
        "full_name": "Country Admin User",
        "employee_id": "00000000-0000-0000-0000-000000000002",
        "org_level": 2,
        "iata_branch_code": "CMB"
    },
    "branchadmin@dgl.com": {
        "password_hash": generate_password_hash("Branch@123"),
        "role": "Branch Admin",
        "full_name": "Branch Admin User",
        "employee_id": "00000000-0000-0000-0000-000000000003",
        "org_level": 3,
        "iata_branch_code": "CMB"
    },
    "deptadmin@dgl.com": {
        "password_hash": generate_password_hash("Dept@123"),
        "role": "Dept Admin",
        "full_name": "Dept Admin User",
        "employee_id": "00000000-0000-0000-0000-000000000004",
        "org_level": 4,
        "iata_branch_code": "CMB"
    },
    "subdeptadmin@dgl.com": {
        "password_hash": generate_password_hash("Subdept@123"),
        "role": "Sub Dept Admin",
        "full_name": "Sub Dept Admin User",
        "employee_id": "00000000-0000-0000-0000-000000000005",
        "org_level": 5,
        "iata_branch_code": "CMB"
    },
    "employee@dgl.com": {
        "password_hash": generate_password_hash("Emp@123"),
        "role": "Employee",
        "full_name": "Employee User",
        "employee_id": "00000000-0000-0000-0000-000000000006",
        "org_level": 6,
        "iata_branch_code": "CMB"
    },
}

# ── Role redirects ───────────────────────────────────────────────────────────
ROLE_REDIRECTS = {
    "HQ Admin":       "/hq-admin/dashboard",
    "Country Admin":  "/country-admin/dashboard",
    "Branch Admin":   "/branch-admin/dashboard",
    "Dept Admin":     "/dept-admin/dashboard",
    "Sub Dept Admin": "/sub-dept-admin/dashboard",
    "Employee":       "/employee/profile",
}

# ── Role keys for frontend sidebar ───────────────────────────────────────────
ROLE_KEYS = {
    "HQ Admin":       "hq_admin",
    "Country Admin":  "country_admin",
    "Branch Admin":   "branch_admin",
    "Dept Admin":     "dept_admin",
    "Sub Dept Admin": "sub_dept_admin",
    "Employee":       "employee",
}

# ── Role profile paths ───────────────────────────────────────────────────────
ROLE_PROFILE_PATHS = {
    1: "/hq-admin/profile",
    2: "/country-admin/profile",
    3: "/branch-admin/profile",
    4: "/dept-admin/profile",
    5: "/sub-dept-admin/profile",
    6: "/employee/profile",
}

def is_valid_email(email):
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None


# ════════════════════════════════════════════════════════════════════════════
# OBJECTIVE CUTOFF SCHEDULER
# ════════════════════════════════════════════════════════════════════════════

def send_cutoff_notification(recipient_org_level: int, title: str, message: str):
    try:
        users = supabase.table("users")\
            .select("id")\
            .eq("org_level", recipient_org_level)\
            .eq("is_active", True)\
            .execute()

        for user in users.data:
            supabase.table("notifications").insert({
                "receiver_id":  user["id"],
                "type":         "objective_cutoff",
                "title":        title,
                "message":      message,
                "triggered_by": "system",
                "action_link":  None,
            }).execute()

        print(f"✅ Cutoff notification sent to org_level {recipient_org_level}")

    except Exception as e:
        print(f"❌ Failed to send cutoff notification: {str(e)}")


def send_all_users_notification(title: str, message: str):
    try:
        users = supabase.table("users")\
            .select("id")\
            .eq("is_active", True)\
            .execute()

        for user in users.data:
            supabase.table("notifications").insert({
                "receiver_id":  user["id"],
                "type":         "objective_cutoff",
                "title":        title,
                "message":      message,
                "triggered_by": "system",
                "action_link":  None,
            }).execute()

        print("✅ Notification sent to all users")

    except Exception as e:
        print(f"❌ Failed to send all users notification: {str(e)}")


def job_july_1():
    send_all_users_notification(
        title="New Appraisal Year Started",
        message="New appraisal year has started. Objective setting window is now open."
    )

def job_july_31():
    send_cutoff_notification(5,
        title="Objectives Setting Reminder",
        message="Reminder: Objectives must be set for your team by 31st August. Please begin KPI assignment now."
    )

def job_aug_5():
    send_cutoff_notification(4,
        title="Objectives Setting Alert",
        message="Alert: Objective setting is in progress. Verify that your Sub Dept Admins have begun KPI assignments."
    )

def job_aug_10():
    send_cutoff_notification(3,
        title="Objectives Setting Escalation",
        message="Escalation: Objective setting deadline approaching. Confirm Dept Admins are progressing with KPI assignments."
    )

def job_aug_15():
    send_cutoff_notification(2,
        title="Objectives Setting Escalation",
        message="Escalation: Objective setting nearing final deadline. Ensure all branches have completed KPI assignments."
    )

def job_aug_25():
    send_cutoff_notification(1,
        title="Final Escalation — Objectives Setting",
        message="Final Escalation: Objective setting closes 31st August. Incomplete assignments frozen with previous year KPIs. Grace period until 15th September."
    )

def job_aug_31():
    send_all_users_notification(
        title="Objectives Setting Window Closed",
        message="Objective setting window is now CLOSED. Incomplete objectives frozen with previous year KPIs."
    )

def job_sep_15():
    send_cutoff_notification(1,
        title="Grace Period Ended",
        message="Grace period has ended. PMS templates are now fully frozen. No further changes permitted until next appraisal cycle."
    )

def start_scheduler():
    scheduler = BackgroundScheduler()
    scheduler.add_job(job_july_1,  CronTrigger(month=7, day=1,  hour=8, minute=0))
    scheduler.add_job(job_july_31, CronTrigger(month=7, day=31, hour=8, minute=0))
    scheduler.add_job(job_aug_5,   CronTrigger(month=8, day=5,  hour=8, minute=0))
    scheduler.add_job(job_aug_10,  CronTrigger(month=8, day=10, hour=8, minute=0))
    scheduler.add_job(job_aug_15,  CronTrigger(month=8, day=15, hour=8, minute=0))
    scheduler.add_job(job_aug_25,  CronTrigger(month=8, day=25, hour=8, minute=0))
    scheduler.add_job(job_aug_31,  CronTrigger(month=8, day=31, hour=8, minute=0))
    scheduler.add_job(job_sep_15,  CronTrigger(month=9, day=15, hour=8, minute=0))
    scheduler.start()
    print("✅ Objective cutoff scheduler started")


# ════════════════════════════════════════════════════════════════════════════
# SYSTEM ROUTES
# ════════════════════════════════════════════════════════════════════════════

@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "service": "pms-backend"}), 200

@app.get("/api/test-db")
def test_db():
    try:
        result = supabase.table("users").select("*").execute()
        return jsonify({"status": "connected", "users": result.data}), 200
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
        "message":          "Login successful",
        "employee_id":      user["employee_id"],
        "full_name":        user["full_name"],
        "email":            email,
        "org_level":        user["org_level"],
        "role":             ROLE_KEYS.get(user["role"]),
        "iata_branch_code": user["iata_branch_code"],
        "redirectTo":       ROLE_REDIRECTS.get(user["role"])
    }), 200


# ════════════════════════════════════════════════════════════════════════════
# PROFILE ROUTES
# ════════════════════════════════════════════════════════════════════════════

@app.get("/api/profile/<employee_id>")
def get_profile(employee_id):
    try:
        result = supabase.table("users")\
            .select("*")\
            .eq("id", employee_id)\
            .execute()

        if not result.data:
            return jsonify({"message": "User not found"}), 404

        return jsonify({"profile": result.data[0]}), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500


# ════════════════════════════════════════════════════════════════════════════
# PERFORMANCE DIARY ROUTES
# ════════════════════════════════════════════════════════════════════════════

@app.get("/api/diary/<employee_id>")
def get_diary(employee_id):
    try:
        self_entries = supabase.table("performance_diary")\
            .select("*")\
            .eq("user_id", employee_id)\
            .eq("author_type", "self")\
            .order("created_at", desc=True)\
            .execute()

        supervisor_entries = supabase.table("performance_diary")\
            .select("*")\
            .eq("user_id", employee_id)\
            .eq("author_type", "supervisor")\
            .order("created_at", desc=True)\
            .execute()

        return jsonify({
            "self_entries":       self_entries.data,
            "supervisor_entries": supervisor_entries.data
        }), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500


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
            "user_id":     employee_id,
            "author_id":   employee_id,
            "author_type": "self",
            "entry_date":  entry_date,
            "entry_text":  description,
            "cycle_id":    cycle_id or None,
            "status":      "approved"
        }).execute()

        return jsonify({
            "message": "Diary entry saved",
            "data": result.data[0] if result.data else {}
        }), 201

    except Exception as e:
        return jsonify({"message": str(e)}), 500


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
        result = supabase.table("performance_diary").insert({
            "user_id":     employee_id,
            "author_id":   employee_id,
            "author_type": "self",
            "entry_date":  entry_date,
            "entry_text":  description,
            "cycle_id":    cycle_id or None,
            "status":      "pending"
        }).execute()

        user = supabase.table("users")\
            .select("full_name, org_level, manager_id")\
            .eq("id", employee_id)\
            .execute()

        if user.data:
            emp           = user.data[0]
            supervisor_id = emp.get("manager_id")
            full_name     = emp.get("full_name")

            if supervisor_id:
                supervisor = supabase.table("users")\
                    .select("org_level")\
                    .eq("id", supervisor_id)\
                    .execute()

                if supervisor.data:
                    supervisor_level = supervisor.data[0]["org_level"]
                    base_path  = ROLE_PROFILE_PATHS.get(supervisor_level, "/")
                    action_url = f"{base_path}?employee_id={employee_id}"

                    supabase.table("notifications").insert({
                        "receiver_id":  supervisor_id,
                        "type":         "diary_approval",
                        "title":        full_name,
                        "message":      description,
                        "triggered_by": "system",
                        "action_link":  action_url,
                    }).execute()

        return jsonify({
            "message": "Diary entry submitted for approval",
            "data": result.data[0] if result.data else {}
        }), 201

    except Exception as e:
        return jsonify({"message": str(e)}), 500


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
            "user_id":     employee_id,
            "author_id":   supervisor_id,
            "author_type": "supervisor",
            "entry_date":  entry_date,
            "entry_text":  description,
            "cycle_id":    cycle_id or None,
            "status":      "approved"
        }).execute()

        return jsonify({
            "message": "Supervisor comment added",
            "data": result.data[0] if result.data else {}
        }), 201

    except Exception as e:
        return jsonify({"message": str(e)}), 500


@app.patch("/api/diary/<diary_id>/approve")
def approve_diary(diary_id):
    data = request.get_json(silent=True) or {}
    reviewer_id = (data.get("reviewer_id") or "").strip()

    try:
        supabase.table("performance_diary")\
            .update({
                "status":      "approved",
                "reviewed_by": reviewer_id,
                "reviewed_at": datetime.now(timezone.utc).isoformat()
            })\
            .eq("id", diary_id)\
            .execute()

        diary = supabase.table("performance_diary")\
            .select("user_id, entry_text")\
            .eq("id", diary_id)\
            .execute()

        if diary.data:
            employee_id = diary.data[0]["user_id"]
            description = diary.data[0]["entry_text"]

            user = supabase.table("users")\
                .select("org_level")\
                .eq("id", employee_id)\
                .execute()

            org_level  = user.data[0]["org_level"] if user.data else 6
            action_url = ROLE_PROFILE_PATHS.get(org_level, "/")

            supabase.table("notifications").insert({
                "receiver_id":  employee_id,
                "type":         "diary_approval",
                "title":        "Achievement Approved ✅",
                "message":      f"Your diary entry has been approved: {description[:100]}",
                "triggered_by": "system",
                "action_link":  action_url,
            }).execute()

        return jsonify({"message": "Diary entry approved"}), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500


@app.patch("/api/diary/<diary_id>/reject")
def reject_diary(diary_id):
    data = request.get_json(silent=True) or {}
    reviewer_id = (data.get("reviewer_id") or "").strip()

    try:
        supabase.table("performance_diary")\
            .update({
                "status":      "rejected",
                "reviewed_by": reviewer_id,
                "reviewed_at": datetime.now(timezone.utc).isoformat()
            })\
            .eq("id", diary_id)\
            .execute()

        diary = supabase.table("performance_diary")\
            .select("user_id, entry_text")\
            .eq("id", diary_id)\
            .execute()

        if diary.data:
            employee_id = diary.data[0]["user_id"]
            description = diary.data[0]["entry_text"]

            user = supabase.table("users")\
                .select("org_level")\
                .eq("id", employee_id)\
                .execute()

            org_level  = user.data[0]["org_level"] if user.data else 6
            action_url = ROLE_PROFILE_PATHS.get(org_level, "/")

            supabase.table("notifications").insert({
                "receiver_id":  employee_id,
                "type":         "diary_approval",
                "title":        "Achievement Rejected ❌",
                "message":      f"Your diary entry was not approved: {description[:100]}",
                "triggered_by": "system",
                "action_link":  action_url,
            }).execute()

        return jsonify({"message": "Diary entry rejected"}), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500


@app.delete("/api/diary/<diary_id>")
def delete_diary(diary_id):
    try:
        supabase.table("performance_diary")\
            .delete()\
            .eq("id", diary_id)\
            .execute()
        return jsonify({"message": "Entry deleted"}), 200
    except Exception as e:
        return jsonify({"message": str(e)}), 500


# ════════════════════════════════════════════════════════════════════════════
# NOTIFICATION ROUTES
# ════════════════════════════════════════════════════════════════════════════

@app.get("/api/notifications/<employee_id>")
def get_notifications(employee_id):
    try:
        result = supabase.table("notifications")\
            .select("*")\
            .eq("receiver_id", employee_id)\
            .order("created_at", desc=True)\
            .execute()

        return jsonify({"notifications": result.data}), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500


@app.patch("/api/notifications/<notification_id>/read")
def mark_notification_read(notification_id):
    try:
        supabase.table("notifications")\
            .update({
                "is_read": True,
                "read_at": datetime.now(timezone.utc).isoformat()
            })\
            .eq("id", notification_id)\
            .execute()

        return jsonify({"message": "Marked as read"}), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500


@app.post("/api/notifications/trigger-cutoff")
def trigger_cutoff():
    data = request.get_json(silent=True) or {}
    job  = (data.get("job") or "").strip()

    jobs = {
        "july_1":  job_july_1,
        "july_31": job_july_31,
        "aug_5":   job_aug_5,
        "aug_10":  job_aug_10,
        "aug_15":  job_aug_15,
        "aug_25":  job_aug_25,
        "aug_31":  job_aug_31,
        "sep_15":  job_sep_15,
    }

    if job not in jobs:
        return jsonify({
            "message": "Invalid job. Use: july_1, july_31, aug_5, aug_10, aug_15, aug_25, aug_31, sep_15"
        }), 400

    jobs[job]()
    return jsonify({"message": f"Notification triggered: {job}"}), 200


# ════════════════════════════════════════════════════════════════════════════
# TRAINING PASSPORT ROUTES
# ════════════════════════════════════════════════════════════════════════════

@app.get("/api/training/attended/<employee_id>")
def get_training_attended(employee_id):
    try:
        result = supabase.table("training_passport")\
            .select("*")\
            .eq("user_id", employee_id)\
            .order("training_date", desc=True)\
            .execute()

        return jsonify({"trainings": result.data}), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500


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
        result = supabase.table("training_passport").insert({
            "user_id":          employee_id,
            "training_name":    programme_name,
            "training_date":    training_date,
            "trainer_provider": trainer_provider,
            "provider":         trainer_provider,
            "cycle_id":         cycle_id or None,
        }).execute()

        return jsonify({
            "message": "Training record added",
            "data": result.data[0] if result.data else {}
        }), 201

    except Exception as e:
        return jsonify({"message": str(e)}), 500


@app.post("/api/training/suggestions")
def add_training_suggestion():
    data = request.get_json(silent=True) or {}
    employee_id   = (data.get("employee_id") or "").strip()
    training_name = (data.get("training_name") or "").strip()
    justification = (data.get("justification") or "").strip()

    if not employee_id or not training_name or not justification:
        return jsonify({"message": "All fields are required"}), 400

    try:
        user = supabase.table("users")\
            .select("manager_id")\
            .eq("id", employee_id)\
            .execute()

        supervisor_id = None
        if user.data:
            supervisor_id = user.data[0].get("manager_id")

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


@app.get("/api/training/subordinate-suggestions/<supervisor_id>")
def get_subordinate_suggestions(supervisor_id):
    try:
        result = supabase.table("training_suggestions")\
            .select("*, users!training_suggestions_employee_id_fkey(full_name, role)")\
            .eq("supervisor_id", supervisor_id)\
            .eq("status", "pending")\
            .order("created_at", desc=True)\
            .execute()

        return jsonify({"suggestions": result.data}), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500


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
            .eq("id", suggestion_id)\
            .execute()

        return jsonify({"message": f"Suggestion {action}"}), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500


# ════════════════════════════════════════════════════════════════════════════
# DASHBOARD ROUTES
# ════════════════════════════════════════════════════════════════════════════

@app.get("/api/dashboard/stats/<employee_id>")
def get_dashboard_stats(employee_id):
    try:
        user = supabase.table("users")\
            .select("org_level, iata_branch_code")\
            .eq("id", employee_id)\
            .execute()

        if not user.data:
            return jsonify({"message": "User not found"}), 404

        org_level = user.data[0]["org_level"]
        stats = {}

        if org_level == 1:
            countries  = supabase.table("countries").select("id", count="exact").execute()
            employees  = supabase.table("users").select("id", count="exact").eq("org_level", 6).execute()
            branches   = supabase.table("branches").select("id", count="exact").execute()
            stats = {
                "Total Countries": countries.count or 0,
                "Total Employees": employees.count or 0,
                "Total Branches":  branches.count or 0,
            }

        elif org_level == 2:
            branches    = supabase.table("branches").select("id", count="exact").execute()
            employees   = supabase.table("users").select("id", count="exact").eq("org_level", 6).execute()
            departments = supabase.table("departments").select("id", count="exact").execute()
            stats = {
                "Total Branches":    branches.count or 0,
                "Total Employees":   employees.count or 0,
                "Total Departments": departments.count or 0,
            }

        elif org_level == 3:
            departments = supabase.table("departments").select("id", count="exact").execute()
            employees   = supabase.table("users").select("id", count="exact").eq("org_level", 6).execute()
            stats = {
                "Total Departments": departments.count or 0,
                "Total Employees":   employees.count or 0,
                "Total Sub-Depts":   0,
            }

        elif org_level == 4:
            employees = supabase.table("users").select("id", count="exact").eq("org_level", 6).execute()
            stats = {
                "Total Sub-Departments": 0,
                "Total Employees":       employees.count or 0,
            }

        elif org_level == 5:
            employees = supabase.table("users")\
                .select("id", count="exact")\
                .eq("manager_id", employee_id)\
                .execute()
            stats = {
                "Total Employees": employees.count or 0,
            }

        return jsonify({"stats": stats}), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500


# ════════════════════════════════════════════════════════════════════════════
# RUN SERVER — MUST BE LAST
# ════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    #start_scheduler()
    app.run(host="127.0.0.1", port=5000, debug=True)