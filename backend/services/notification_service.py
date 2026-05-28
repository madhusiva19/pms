import requests as req
from models import supabase, SUPABASE_URL, SUPABASE_KEY
from utils.scheduler import (
    job_july_1, job_july_31,
    job_aug_5, job_aug_10, job_aug_15, job_aug_25, job_aug_31,
    job_sep_15,
)

_JOBS = {
    "july_1":  job_july_1,
    "july_31": job_july_31,
    "aug_5":   job_aug_5,
    "aug_10":  job_aug_10,
    "aug_15":  job_aug_15,
    "aug_25":  job_aug_25,
    "aug_31":  job_aug_31,
    "sep_15":  job_sep_15,
}


def get_notifications(employee_id):
    try:
        result = supabase.table("notifications")\
            .select("*")\
            .eq("receiver_id", employee_id)\
            .order("created_at", desc=True)\
            .execute()

        return {"notifications": result.data}, 200
    except Exception as e:
        return {"message": str(e)}, 500


def mark_read(notification_id):
    try:
        url     = f"{SUPABASE_URL}/rest/v1/notifications"
        headers = {
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type":  "application/json",
            "Prefer":        "return=representation"
        }
        params   = {"id": f"eq.{notification_id}"}
        response = req.patch(url, headers=headers, params=params, json={"is_read": True})

        if response.status_code in (200, 204):
            return {"message": "Marked as read"}, 200

        return {"message": f"Failed: {response.text}"}, 400
    except Exception as e:
        return {"message": str(e)}, 500


def trigger_cutoff(data):
    try:
        job = (data.get("job") or "").strip()

        if job not in _JOBS:
            return {
                "message": "Invalid job. Use: july_1, july_31, aug_5, aug_10, aug_15, aug_25, aug_31, sep_15"
            }, 400

        _JOBS[job]()
        return {"message": f"Notification triggered: {job}"}, 200
    except Exception as e:
        return {"message": str(e)}, 500
