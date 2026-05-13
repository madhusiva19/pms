from flask import Flask, request, jsonify
from flask_cors import CORS

from dotenv import load_dotenv
from datetime import datetime, timezone
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import os
import re

load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:3000"]}})

# ── Supabase client ──────────────────────────────────────────────────────────
SUPABASE_URL      = os.getenv("SUPABASE_URL")
SUPABASE_KEY      = os.getenv("SUPABASE_KEY")

import requests as req

class SupabaseClient:
    def __init__(self, url, key):
        self.url = url
        self.key = key
        self.headers = {
            "apikey":        key,
            "Authorization": f"Bearer {key}",
            "Content-Type":  "application/json",
            "Prefer":        "return=representation"
        }

    def table(self, table_name):
        return SupabaseTable(self.url, self.headers, table_name)


class SupabaseTable:
    def __init__(self, url, headers, table_name):
        self.url        = url
        self.headers    = dict(headers)
        self.table_name = table_name
        self.params     = {}
        self.method     = "GET"
        self.body       = None
        self._count     = None

    def select(self, columns="*", count=None):
        self.params["select"] = columns
        if count == "exact":
            self.headers = {**self.headers, "Prefer": "count=exact"}
            self._count  = True
        return self

    def insert(self, data):
        self.method = "POST"
        self.body   = data
        return self

    def update(self, data):
        self.method = "PATCH"
        self.body   = data
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

        filter_params = {k: v for k, v in self.params.items() if k != "select"}
        all_params    = self.params

        if self.method == "GET":
            res = req.get(url, headers=self.headers, params=all_params)
        elif self.method == "POST":
            res = req.post(url, headers=self.headers, json=self.body)
        elif self.method == "PATCH":
            res = req.patch(url, headers=self.headers, params=filter_params, json=self.body)
        elif self.method == "DELETE":
            res = req.delete(url, headers=self.headers, params=filter_params)

        class Result:
            pass

        result = Result()
        try:
            result.data = res.json() if res.text else []
            if not isinstance(result.data, list):
                result.data = [result.data] if result.data else []
        except:
            result.data = []

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

# ── Role profile paths ───────────────────────────────────────────────────────
ROLE_PROFILE_PATHS = {
    1: "/hq-admin/profile",
    2: "/country-admin/profile",
    3: "/branch-admin/profile",
    4: "/dept-admin/profile",
    5: "/sub-dept-admin/profile",
    6: "/employee/profile",
}


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
        "url":       os.getenv("SUPABASE_URL"),
        "key_exists": bool(os.getenv("SUPABASE_KEY"))
    }), 200


# ════════════════════════════════════════════════════════════════════════════
# AUTH ROUTES
# ════════════════════════════════════════════════════════════════════════════

@app.post("/api/auth/login")
def login():
    try:
        body     = request.get_json()
        email    = body.get("email", "").strip().lower()
        password = body.get("password", "").strip()

        if not email or not password:
            return jsonify({"message": "Email and password are required"}), 400

        # Step 1 — Authenticate with Supabase Auth
        auth_res = req.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
            headers={
                "apikey":       SUPABASE_KEY,
                "Content-Type": "application/json"
            },
            json={"email": email, "password": password}
        )

        if auth_res.status_code != 200:
            return jsonify({"message": "Invalid email or password"}), 401

        auth_data = auth_res.json()
        auth_id   = auth_data.get("user", {}).get("id")

        if not auth_id:
            return jsonify({"message": "Authentication failed"}), 401

        # Step 2 — Fetch user profile from users table
        user_res = supabase.table("users")\
            .select("*")\
            .eq("id", auth_id)\
            .execute()

        if not user_res.data:
            return jsonify({"message": "User profile not found"}), 404

        user      = user_res.data[0]
        role      = user.get("role")
        org_level = user.get("org_level")

        role_redirects = {
            "hq_admin":       "/hq-admin/dashboard",
            "country_admin":  "/country-admin/dashboard",
            "branch_admin":   "/branch-admin/dashboard",
            "dept_admin":     "/dept-admin/dashboard",
            "sub_dept_admin": "/sub-dept-admin/dashboard",
            "employee":       "/employee/profile",  # employees have no dashboard
        }

        redirect = role_redirects.get(role, "/employee/profile")

        return jsonify({
            "message":  "Login successful",
            "redirect": redirect,
            "user": {
                "id":               auth_id,
                "email":            user.get("email"),
                "full_name":        user.get("full_name"),
                "role":             role,
                "org_level":        org_level,
                "iata_branch_code": user.get("iata_branch_code"),
                "country_id":       user.get("country_id"),
                "branch_id":        user.get("branch_id"),
                "dept_id":          user.get("department_id"),
                "sub_dept_id":      user.get("sub_department_id"),
                "avatar_url":       user.get("avatar_url"),
            }
        }), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500


@app.post("/api/auth/forgot-password")
def forgot_password():
    try:
        body  = request.get_json()
        email = body.get("email", "").strip().lower()

        if not email:
            return jsonify({"message": "Email is required"}), 400

        # Send reset email via Supabase Auth
        res = req.post(
            f"{SUPABASE_URL}/auth/v1/recover",
            headers={
                "apikey":       SUPABASE_KEY,
                "Content-Type": "application/json"
            },
            json={"email": email,
                  "redirect_to": "http://localhost:3000/reset-password"
                 }
        )

        # Always return 200 — don't reveal if email exists (security)
        return jsonify({"message": "Reset link sent if account exists"}), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500

@app.post("/api/auth/reset-password")
def reset_password():
    try:
        body       = request.get_json()
        token_hash = body.get("token", "").strip()
        password   = body.get("password", "").strip()

        if not token_hash or not password:
            return jsonify({"message": "Token and password required"}), 400

        if len(password) < 8:
            return jsonify({"message": "Password must be at least 8 characters"}), 400

        # First verify the token hash
        verify_res = req.post(
            f"{SUPABASE_URL}/auth/v1/verify",
            headers={
                "apikey":       SUPABASE_KEY,
                "Content-Type": "application/json"
            },
            json={
                "token_hash": token_hash,
                "type":       "recovery"
            }
        )

        print("Verify status:", verify_res.status_code)
        print("Verify body:", verify_res.json())

        if verify_res.status_code != 200:
            return jsonify({"message": "Reset link expired or invalid"}), 400

        # Get access token from verify response
        access_token = verify_res.json().get("access_token")

        # Update password
        update_res = req.put(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "apikey":        SUPABASE_KEY,
                "Authorization": f"Bearer {access_token}",
                "Content-Type":  "application/json"
            },
            json={"password": password}
        )

        if update_res.status_code == 200:
            return jsonify({"message": "Password reset successfully"}), 200
        else:
            return jsonify({"message": "Reset failed"}), 400

    except Exception as e:
        return jsonify({"message": str(e)}), 500
# ════════════════════════════════════════════════════════════════════════════
# PROFILE ROUTES
# ════════════════════════════════════════════════════════════════════════════

@app.get("/api/profile/<employee_id>")
def get_profile(employee_id):
    try:
        result = supabase.table("users")\
            .select("*, designations!fk_designation(name)")\
            .eq("id", employee_id)\
            .execute()

        if not result.data:
            return jsonify({"message": "User not found"}), 404

        profile = result.data[0]
        # Flatten designation name
        if profile.get("designations"):
            profile["designation"] = profile["designations"]["name"]

        return jsonify({"profile": profile}), 200

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
        
        # Fetch supervisor names
        for entry in supervisor_entries.data:
            author_id = entry.get("author_id")
            if author_id:
                author = supabase.table("users")\
                    .select("full_name")\
                    .eq("id", author_id)\
                    .execute()
                entry["author_name"] = author.data[0]["full_name"] if author.data else "Unknown"

        return jsonify({
            "self_entries":       self_entries.data,
            "supervisor_entries": supervisor_entries.data
        }), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500


@app.post("/api/diary/save")
def save_diary():
    data        = request.get_json(silent=True) or {}
    employee_id = (data.get("employee_id") or "").strip()
    description = (data.get("description") or "").strip()
    entry_date  = (data.get("entry_date")  or "").strip()
    cycle_id    = (data.get("cycle_id")    or "").strip()

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
            "data":    result.data[0] if result.data else {}
        }), 201

    except Exception as e:
        return jsonify({"message": str(e)}), 500


@app.post("/api/diary/submit")
def submit_diary():
    data        = request.get_json(silent=True) or {}
    employee_id = (data.get("employee_id") or "").strip()
    description = (data.get("description") or "").strip()
    entry_date  = (data.get("entry_date")  or "").strip()
    cycle_id    = (data.get("cycle_id")    or "").strip()

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
                    base_path        = ROLE_PROFILE_PATHS.get(supervisor_level, "/")
                    action_url       = f"{base_path}?employee_id={employee_id}"

                    try:
                        notif_result = supabase.table("notifications").insert({
                            "receiver_id":  supervisor_id,
                            "type":         "diary_approval",
                            "title":        full_name,
                            "message":      description,
                            "triggered_by": "system",
                            "action_link":  action_url,
                        }).execute()
                        print(f"DEBUG supervisor_id: {supervisor_id}")
                        print(f"DEBUG notif_result: {notif_result.data}")
                    except Exception as notif_err:
                        print(f"DEBUG notif_error: {str(notif_err)}")

        return jsonify({
            "message": "Diary entry submitted for approval",
            "data":    result.data[0] if result.data else {}
        }), 201

    except Exception as e:
        print(f"DEBUG submit_diary error: {str(e)}")
        return jsonify({"message": str(e)}), 500


@app.post("/api/diary/supervisor")
def add_supervisor_diary():
    data          = request.get_json(silent=True) or {}
    employee_id   = (data.get("employee_id")   or "").strip()
    supervisor_id = (data.get("supervisor_id") or "").strip()
    description   = (data.get("description")   or "").strip()
    entry_date    = (data.get("entry_date")     or "").strip()
    cycle_id      = (data.get("cycle_id")       or "").strip()

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
            "data":    result.data[0] if result.data else {}
        }), 201

    except Exception as e:
        return jsonify({"message": str(e)}), 500


@app.patch("/api/diary/<diary_id>/approve")
def approve_diary(diary_id):
    data        = request.get_json(silent=True) or {}
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
    data        = request.get_json(silent=True) or {}
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
        url = f"{SUPABASE_URL}/rest/v1/notifications"
        headers = {
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type":  "application/json",
            "Prefer":        "return=representation"
        }
        params = {"id": f"eq.{notification_id}"}
        body   = {"is_read": True}

        response = req.patch(url, headers=headers, params=params, json=body)

        if response.status_code in (200, 204):
            return jsonify({"message": "Marked as read"}), 200
        else:
            return jsonify({"message": f"Failed: {response.text}"}), 400

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
    data             = request.get_json(silent=True) or {}
    employee_id      = (data.get("employee_id")      or "").strip()
    programme_name   = (data.get("programme_name")   or "").strip()
    training_date    = (data.get("training_date")    or "").strip()
    trainer_provider = (data.get("trainer_provider") or "").strip()
    cycle_id         = (data.get("cycle_id")         or "").strip()

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
            "data":    result.data[0] if result.data else {}
        }), 201

    except Exception as e:
        return jsonify({"message": str(e)}), 500


@app.post("/api/training/suggestions")
def add_training_suggestion():
    data          = request.get_json(silent=True) or {}
    employee_id   = (data.get("employee_id")   or "").strip()
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
            "data":    result.data[0] if result.data else {}
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
            .select("*")\
            .eq("supervisor_id", supervisor_id)\
            .eq("status", "pending")\
            .order("created_at", desc=True)\
            .execute()

        suggestions = []
        for s in result.data:
            employee_id = s.get("employee_id")
            full_name   = ""
            role        = ""
            if employee_id:
                user = supabase.table("users")\
                    .select("full_name, role")\
                    .eq("id", employee_id)\
                    .execute()
                if user.data:
                    full_name = user.data[0].get("full_name", "")
                    role      = user.data[0].get("role", "")

            suggestions.append({
                **s,
                "users": {
                    "full_name": full_name,
                    "role":      role,
                }
            })

        return jsonify({"suggestions": suggestions}), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500


@app.patch("/api/training/suggestions/<suggestion_id>")
def review_suggestion(suggestion_id):
    data    = request.get_json(silent=True) or {}
    action  = (data.get("action")  or "").strip()
    comment = (data.get("comment") or "").strip()

    if action not in ("approved", "rejected"):
        return jsonify({"message": "Action must be approved or rejected"}), 400

    try:
        url = f"{SUPABASE_URL}/rest/v1/training_suggestions"
        headers = {
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type":  "application/json",
            "Prefer":        "return=representation"
        }
        params = {"id": f"eq.{suggestion_id}"}
        body   = {
            "status":             action,
            "supervisor_comment": comment,
            "updated_at":         datetime.now(timezone.utc).isoformat()
        }

        response = req.patch(url, headers=headers, params=params, json=body)

        if response.status_code in (200, 204):
            return jsonify({"message": f"Suggestion {action}"}), 200
        else:
            return jsonify({"message": f"Failed: {response.text}"}), 400

    except Exception as e:
        return jsonify({"message": str(e)}), 500


# ════════════════════════════════════════════════════════════════════════════
# DASHBOARD ROUTES
# ════════════════════════════════════════════════════════════════════════════

@app.get("/api/dashboard/stats/<employee_id>")
def get_dashboard_stats(employee_id):
    try:
        user = supabase.table("users")\
            .select("org_level, iata_branch_code, country_id, branch_id, department_id, sub_department_id")\
            .eq("id", employee_id)\
            .execute()

        if not user.data:
            return jsonify({"message": "User not found"}), 404

        u         = user.data[0]
        org_level  = u["org_level"]
        country_id = u.get("country_id")
        branch_id  = u.get("branch_id")
        dept_id    = u.get("department_id")
        stats      = {}

        if org_level == 1:
            # HQ Admin — global counts
            countries = supabase.table("countries").select("id", count="exact").execute()
            branches  = supabase.table("branches").select("id", count="exact").execute()
            employees = supabase.table("users").select("id", count="exact").eq("org_level", 6).execute()
            stats = {
                "Total Countries": countries.count or 0,
                "Total Branches":  branches.count  or 0,
                "Total Employees": employees.count or 0,
            }

        elif org_level == 2:
            # Country Admin — filter by country
            branches  = supabase.table("branches").select("id", count="exact").eq("country_id", country_id).execute()
            depts     = supabase.table("departments").select("id", count="exact").execute()
            # Count all users in this country (org levels 3,4,5,6)
            emp3 = supabase.table("users").select("id", count="exact").eq("org_level", 3).eq("country_id", country_id).execute()
            emp4 = supabase.table("users").select("id", count="exact").eq("org_level", 4).eq("country_id", country_id).execute()
            emp5 = supabase.table("users").select("id", count="exact").eq("org_level", 5).eq("country_id", country_id).execute()
            emp6 = supabase.table("users").select("id", count="exact").eq("org_level", 6).eq("country_id", country_id).execute()
            total_employees = (emp3.count or 0) + (emp4.count or 0) + (emp5.count or 0) + (emp6.count or 0)
            stats = {
                "Total Branches":    branches.count or 0,
                "Total Employees":   total_employees,
                "Total Departments": emp4.count or 0,
            }

        elif org_level == 3:
            # Branch Admin — filter by branch
            depts = supabase.table("departments").select("id", count="exact").eq("branch_id", branch_id).execute()
            emp4  = supabase.table("users").select("id", count="exact").eq("org_level", 4).eq("branch_id", branch_id).execute()
            emp5  = supabase.table("users").select("id", count="exact").eq("org_level", 5).eq("branch_id", branch_id).execute()
            emp6  = supabase.table("users").select("id", count="exact").eq("org_level", 6).eq("branch_id", branch_id).execute()
            subdepts = supabase.table("sub_departments").select("id", count="exact").execute()
            total_employees = (emp4.count or 0) + (emp5.count or 0) + (emp6.count or 0)
            stats = {
                "Total Departments": depts.count    or 0,
                "Total Employees":   total_employees,
                "Total Sub-Depts":   emp5.count     or 0,
            }

        elif org_level == 4:
            # Dept Admin — filter by department
            subdepts = supabase.table("sub_departments").select("id", count="exact").eq("department_id", dept_id).execute()
            emp5     = supabase.table("users").select("id", count="exact").eq("org_level", 5).eq("department_id", dept_id).execute()
            emp6     = supabase.table("users").select("id", count="exact").eq("org_level", 6).eq("department_id", dept_id).execute()
            stats = {
                "Total Sub-Departments": subdepts.count or 0,
                "Total Employees":       emp6.count     or 0,
            }

        elif org_level == 5:
            # Sub Dept Admin — only their direct reports
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
    
def get_score(entity_id: str, entity_type: str) -> float:
    url = f"{SUPABASE_URL}/rest/v1/performance_scores"
    headers = {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json"
    }
    # Use direct URL params instead of dict
    full_url = f"{url}?select=avg_score&entity_type=eq.{entity_type}&entity_id=eq.{entity_id}"
    res = req.get(full_url, headers=headers)
    print(f"DEBUG url: {full_url}")
    print(f"DEBUG response: {res.text}")
    data = res.json()
    return float(data[0]["avg_score"]) if data else 0.0

@app.get("/api/dashboard/charts/<employee_id>")
def get_dashboard_charts(employee_id):
    try:
        user = supabase.table("users")\
            .select("org_level, country_id, branch_id, department_id, sub_department_id")\
            .eq("id", employee_id)\
            .execute()

        if not user.data:
            return jsonify({"message": "User not found"}), 404

        u          = user.data[0]
        org_level  = u["org_level"]
        country_id = u.get("country_id")
        branch_id  = u.get("branch_id")
        dept_id    = u.get("department_id")

        COLORS = ["#2563EB","#00C49F","#FFBB28","#FF8042","#8884D8",
                  "#4F39F6","#E11D48","#0891B2","#65A30D","#D97706"]

        bar = []
        pie = []

        if org_level == 1:
            # HQ → by country
            countries = supabase.table("countries")\
                .select("id, name, total_employees")\
                .execute()
            for i, c in enumerate(countries.data):
                # TODO: Replace 0 with real avg score from evaluations table
                bar.append({
                    "name":  c["name"],
                    "score": get_score(c["id"], "country"),
                    "fill":  COLORS[i % len(COLORS)]
                })
                pie.append({
                    "name":  c["name"],
                    "value": c.get("total_employees") or 0,
                    "color": COLORS[i % len(COLORS)]
                })

        elif org_level == 2:
            # CA → by branch (or dept if no branch like Sri Lanka)
            branches = supabase.table("branches")\
                .select("id, name, total_employees")\
                .eq("country_id", country_id)\
                .execute()

            if branches.data:
                for i, b in enumerate(branches.data):
                    bar.append({
                        "name":  b.get("name", "Unknown"),
                        "score": get_score(b["id"], "branch"),
                        "fill":  COLORS[i % len(COLORS)]
                    })
                    pie.append({
                        "name":  b.get("name", "Unknown"),
                        "value": b.get("total_employees") or 0,
                        "color": COLORS[i % len(COLORS)]
                    })
            else:
                # Sri Lanka — no branches, show departments
                depts = supabase.table("departments")\
                    .select("id, name, total_employees")\
                    .eq("country_id", country_id)\
                    .execute()
                for i, d in enumerate(depts.data):
                    bar.append({
                        "name":  d["name"],
                        "score": get_score(d["id"], "department"),
                        "fill":  COLORS[i % len(COLORS)]
                    })
                    pie.append({
                        "name":  d["name"],
                        "value": d.get("total_employees") or 0,
                        "color": COLORS[i % len(COLORS)]
                    })

        elif org_level == 3:
            # BA → by department
            depts = supabase.table("departments")\
                .select("id, name, total_employees")\
                .eq("branch_id", branch_id)\
                .execute()
            for i, d in enumerate(depts.data):
                bar.append({
                    "name":  d["name"],
                    "score": get_score(d["id"], "department"),
                    "fill":  COLORS[i % len(COLORS)]
                })
                pie.append({
                    "name":  d["name"],
                    "value": d.get("total_employees") or 0,
                    "color": COLORS[i % len(COLORS)]
                })

        elif org_level == 4:
            # DA → by sub department
            subdepts = supabase.table("sub_departments")\
                .select("id, name, total_employees")\
                .eq("department_id", dept_id)\
                .execute()
            for i, sd in enumerate(subdepts.data):
                bar.append({
                    "name":  sd["name"],
                    "score": get_score(sd["id"], "sub_department"),
                    "fill":  COLORS[i % len(COLORS)]
                })
                pie.append({
                    "name":  sd["name"],
                    "value": sd.get("total_employees") or 0,
                    "color": COLORS[i % len(COLORS)]
                })

        elif org_level == 5:
            # SDA → individual employees
            employees = supabase.table("users")\
                .select("id, full_name")\
                .eq("manager_id", employee_id)\
                .execute()
            for i, e in enumerate(employees.data):
                parts = e["full_name"].split(" ")
                short = f"{parts[0][0]}. {parts[-1]}" if len(parts) > 1 else e["full_name"]
                bar.append({
                    "name":  short,
                    "score": get_score(e["id"], "employee"),
                    "fill":  COLORS[i % len(COLORS)]
                })
            # No pie for SDA

        return jsonify({"data": {"bar": bar, "pie": pie}}), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500

@app.post("/api/profile/upload-avatar")
def upload_avatar():
    try:
        SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

        employee_id  = request.form.get("employee_id")
        file         = request.files.get("file")

        if not file or not employee_id:
            return jsonify({"message": "File and employee_id required"}), 400

        # Validate file type
        allowed_types = ["image/jpeg", "image/png", "image/webp"]
        if file.content_type not in allowed_types:
            return jsonify({"message": "Only JPG, PNG, WebP allowed"}), 400

        # Validate file size (2MB max)
        file_bytes = file.read()
        if len(file_bytes) > 2 * 1024 * 1024:
            return jsonify({"message": "Image must be under 2MB"}), 400

        ext       = file.filename.split(".")[-1].lower()
        file_name = f"{employee_id}-{int(datetime.now().timestamp())}.{ext}"

        # Delete old avatar if exists
        user_res = supabase.table("users")\
            .select("avatar_url")\
            .eq("id", employee_id)\
            .execute()

        if user_res.data and user_res.data[0].get("avatar_url"):
            old_url      = user_res.data[0]["avatar_url"]
            old_filename = old_url.split("/avatars/")[-1]
            req.delete(
                f"{SUPABASE_URL}/storage/v1/object/avatars/{old_filename}",
                headers={
                    "apikey":        SERVICE_KEY,
                    "Authorization": f"Bearer {SERVICE_KEY}",
                }
            )

        # Upload new avatar to Supabase Storage
        upload_res = req.post(
            f"{SUPABASE_URL}/storage/v1/object/avatars/{file_name}",
            headers={
                "apikey":        SERVICE_KEY,
                "Authorization": f"Bearer {SERVICE_KEY}",
                "Content-Type":  file.content_type,
            },
            data=file_bytes
        )

        if upload_res.status_code not in (200, 201):
            return jsonify({"message": f"Upload failed: {upload_res.text}"}), 400

        # Public URL
        avatar_url = f"{SUPABASE_URL}/storage/v1/object/public/avatars/{file_name}"

        # Save URL to users table
        supabase.table("users")\
            .update({"avatar_url": avatar_url})\
            .eq("id", employee_id)\
            .execute()

        return jsonify({"avatar_url": avatar_url}), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500


@app.delete("/api/profile/remove-avatar/<employee_id>")
def remove_avatar(employee_id):
    try:
        SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

        # Get current avatar URL
        user_res = supabase.table("users")\
            .select("avatar_url")\
            .eq("id", employee_id)\
            .execute()

        if user_res.data and user_res.data[0].get("avatar_url"):
            old_url      = user_res.data[0]["avatar_url"]
            old_filename = old_url.split("/avatars/")[-1]

            # Delete from storage
            req.delete(
                f"{SUPABASE_URL}/storage/v1/object/avatars/{old_filename}",
                headers={
                    "apikey":        SERVICE_KEY,
                    "Authorization": f"Bearer {SERVICE_KEY}",
                }
            )

        # Clear avatar_url in DB
        supabase.table("users")\
            .update({"avatar_url": None})\
            .eq("id", employee_id)\
            .execute()

        return jsonify({"message": "Avatar removed"}), 200

    except Exception as e:
        return jsonify({"message": str(e)}), 500       

# ════════════════════════════════════════════════════════════════════════════
# RUN SERVER — MUST BE LAST
# ════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    # start_scheduler()  # Uncomment in production
    app.run(host="127.0.0.1", port=5000, debug=True)