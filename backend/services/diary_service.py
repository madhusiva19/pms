from datetime import datetime, timezone
from models import supabase

ROLE_PROFILE_PATHS = {
    1: "/hq-admin/profile",
    2: "/country-admin/profile",
    3: "/branch-admin/profile",
    4: "/dept-admin/profile",
    5: "/sub-dept-admin/profile",
    6: "/employee/profile",
}


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

        for entry in supervisor_entries.data:
            author_id = entry.get("author_id")
            if author_id:
                author = supabase.table("users")\
                    .select("full_name")\
                    .eq("id", author_id)\
                    .execute()
                entry["author_name"] = author.data[0]["full_name"] if author.data else "Unknown"

        return {
            "self_entries":       self_entries.data,
            "supervisor_entries": supervisor_entries.data
        }, 200
    except Exception as e:
        return {"message": str(e)}, 500


def save_diary(body):
    try:
        employee_id = (body.get("employee_id") or "").strip()
        description = (body.get("description") or "").strip()
        entry_date  = (body.get("entry_date")  or "").strip()
        cycle_id    = (body.get("cycle_id")    or "").strip()

        if not employee_id or not description or not entry_date:
            return {"message": "employee_id, description and entry_date are required"}, 400

        result = supabase.table("performance_diary").insert({
            "user_id":     employee_id,
            "author_id":   employee_id,
            "author_type": "self",
            "entry_date":  entry_date,
            "entry_text":  description,
            "cycle_id":    cycle_id or None,
            "status":      "approved"
        }).execute()

        return {
            "message": "Diary entry saved",
            "data":    result.data[0] if result.data else {}
        }, 201
    except Exception as e:
        return {"message": str(e)}, 500


def submit_diary(body):
    try:
        employee_id = (body.get("employee_id") or "").strip()
        description = (body.get("description") or "").strip()
        entry_date  = (body.get("entry_date")  or "").strip()
        cycle_id    = (body.get("cycle_id")    or "").strip()

        if not employee_id or not description or not entry_date:
            return {"message": "employee_id, description and entry_date are required"}, 400

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
                    except Exception as notif_err:
                        print(f"DEBUG notif_error: {str(notif_err)}")

        return {
            "message": "Diary entry submitted for approval",
            "data":    result.data[0] if result.data else {}
        }, 201
    except Exception as e:
        return {"message": str(e)}, 500


def add_supervisor_diary(body):
    try:
        employee_id   = (body.get("employee_id")   or "").strip()
        supervisor_id = (body.get("supervisor_id") or "").strip()
        description   = (body.get("description")   or "").strip()
        entry_date    = (body.get("entry_date")     or "").strip()
        cycle_id      = (body.get("cycle_id")       or "").strip()

        if not employee_id or not supervisor_id or not description or not entry_date:
            return {"message": "All fields are required"}, 400

        result = supabase.table("performance_diary").insert({
            "user_id":     employee_id,
            "author_id":   supervisor_id,
            "author_type": "supervisor",
            "entry_date":  entry_date,
            "entry_text":  description,
            "cycle_id":    cycle_id or None,
            "status":      "approved"
        }).execute()

        return {
            "message": "Supervisor comment added",
            "data":    result.data[0] if result.data else {}
        }, 201
    except Exception as e:
        return {"message": str(e)}, 500


def approve_diary(diary_id, body):
    try:
        reviewer_id = (body.get("reviewer_id") or "").strip()

        update_result = supabase.table("performance_diary")\
            .update({
                "status":      "approved",
                "reviewed_by": reviewer_id,
                "reviewed_at": datetime.now(timezone.utc).isoformat()
            })\
            .eq("id", diary_id)\
            .eq("status", "pending")\
            .execute()

        if not update_result.data:
            existing = supabase.table("performance_diary")\
                .select("status")\
                .eq("id", diary_id)\
                .execute()
            if existing.data and existing.data[0]["status"] == "approved":
                return {"message": "Diary entry already approved"}, 200
            return {"message": "Diary entry not found or not pending"}, 404

        employee_id = update_result.data[0]["user_id"]
        description = update_result.data[0]["entry_text"]

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

        return {"message": "Diary entry approved"}, 200
    except Exception as e:
        return {"message": str(e)}, 500


def reject_diary(diary_id, body):
    try:
        reviewer_id = (body.get("reviewer_id") or "").strip()

        update_result = supabase.table("performance_diary")\
            .update({
                "status":      "rejected",
                "reviewed_by": reviewer_id,
                "reviewed_at": datetime.now(timezone.utc).isoformat()
            })\
            .eq("id", diary_id)\
            .eq("status", "pending")\
            .execute()

        if not update_result.data:
            existing = supabase.table("performance_diary")\
                .select("status")\
                .eq("id", diary_id)\
                .execute()
            if existing.data and existing.data[0]["status"] == "rejected":
                return {"message": "Diary entry already rejected"}, 200
            return {"message": "Diary entry not found or not pending"}, 404

        employee_id = update_result.data[0]["user_id"]
        description = update_result.data[0]["entry_text"]

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

        return {"message": "Diary entry rejected"}, 200
    except Exception as e:
        return {"message": str(e)}, 500


def delete_diary(diary_id):
    try:
        supabase.table("performance_diary")\
            .delete()\
            .eq("id", diary_id)\
            .execute()

        return {"message": "Entry deleted"}, 200
    except Exception as e:
        return {"message": str(e)}, 500
