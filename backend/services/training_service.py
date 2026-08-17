import requests as req
from datetime import datetime, timezone
from models import supabase, SUPABASE_URL, SUPABASE_KEY, SERVICE_KEY

ALLOWED_EVIDENCE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"]
MAX_EVIDENCE_SIZE      = 5 * 1024 * 1024


def get_training_attended(employee_id):
    try:
        result = supabase.table("training_passport")\
            .select("*")\
            .eq("user_id", employee_id)\
            .order("training_date", desc=True)\
            .execute()

        return {"trainings": result.data}, 200
    except Exception as e:
        print(f"[ERROR] get_training_attended: {e}")
        return {"message": "Something went wrong. Please try again."}, 500


def add_training_attended(request):
    try:
        employee_id      = (request.form.get("employee_id")      or "").strip()
        programme_name   = (request.form.get("programme_name")   or "").strip()
        training_date    = (request.form.get("training_date")    or "").strip()
        trainer_provider = (request.form.get("trainer_provider") or "").strip()
        evidence_file     = request.files.get("evidence")

        if not employee_id or not programme_name or not training_date or not trainer_provider or not evidence_file:
            return {"message": "All fields are required, including proof of evidence"}, 400

        if evidence_file.content_type not in ALLOWED_EVIDENCE_TYPES:
            return {"message": "Evidence must be a JPG, PNG, WebP or PDF file"}, 400

        evidence_bytes = evidence_file.read()
        if len(evidence_bytes) > MAX_EVIDENCE_SIZE:
            return {"message": "Evidence file must be under 5MB"}, 400

        ext            = evidence_file.filename.rsplit(".", 1)[-1].lower()
        evidence_name  = f"{employee_id}-{int(datetime.now(timezone.utc).timestamp())}.{ext}"

        upload_res = req.post(
            f"{SUPABASE_URL}/storage/v1/object/training-evidence/{evidence_name}",
            headers={
                "apikey":        SERVICE_KEY,
                "Authorization": f"Bearer {SERVICE_KEY}",
                "Content-Type":  evidence_file.content_type,
            },
            data=evidence_bytes
        )

        if upload_res.status_code not in (200, 201):
            return {"message": f"Evidence upload failed: {upload_res.text}"}, 400

        evidence_url = f"{SUPABASE_URL}/storage/v1/object/public/training-evidence/{evidence_name}"

        result = supabase.table("training_passport").insert({
            "user_id":          employee_id,
            "training_name":    programme_name,
            "training_date":    training_date,
            "trainer_provider": trainer_provider,
            "evidence_url":     evidence_url,
        }).execute()

        return {
            "message": "Training record added",
            "data":    result.data[0] if result.data else {}
        }, 201
    except Exception as e:
        print(f"[ERROR] add_training_attended: {e}")
        return {"message": "Something went wrong. Please try again."}, 500


def add_training_suggestion(body):
    try:
        employee_id   = (body.get("employee_id")   or "").strip()
        training_name = (body.get("training_name") or "").strip()
        justification = (body.get("justification") or "").strip()

        if not employee_id or not training_name or not justification:
            return {"message": "All fields are required"}, 400

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

        return {
            "message": "Suggestion submitted",
            "data":    result.data[0] if result.data else {}
        }, 201
    except Exception as e:
        print(f"[ERROR] add_training_suggestion: {e}")
        return {"message": "Something went wrong. Please try again."}, 500


def get_training_suggestions(employee_id):
    try:
        result = supabase.table("training_suggestions")\
            .select("*")\
            .eq("employee_id", employee_id)\
            .order("created_at", desc=True)\
            .execute()

        return {"suggestions": result.data}, 200
    except Exception as e:
        print(f"[ERROR] get_training_suggestions: {e}")
        return {"message": "Something went wrong. Please try again."}, 500


def get_subordinate_suggestions(supervisor_id):
    try:
        result = supabase.table("training_suggestions")\
            .select("*")\
            .eq("supervisor_id", supervisor_id)\
            .eq("status", "pending")\
            .order("created_at", desc=True)\
            .execute()

        employee_ids = list({s["employee_id"] for s in result.data if s.get("employee_id")})
        user_map = {}
        if employee_ids:
            users_res = supabase.table("users")\
                .select("id, full_name, role")\
                .in_("id", employee_ids)\
                .execute()
            user_map = {u["id"]: u for u in users_res.data}

        suggestions = []
        for s in result.data:
            u = user_map.get(s.get("employee_id"), {})
            suggestions.append({
                **s,
                "users": {
                    "full_name": u.get("full_name", ""),
                    "role":      u.get("role", ""),
                }
            })

        return {"suggestions": suggestions}, 200
    except Exception as e:
        print(f"[ERROR] get_subordinate_suggestions: {e}")
        return {"message": "Something went wrong. Please try again."}, 500


def review_suggestion(suggestion_id, body):
    try:
        action  = (body.get("action")  or "").strip()
        comment = (body.get("comment") or "").strip()

        if action not in ("approved", "rejected"):
            return {"message": "Action must be approved or rejected"}, 400

        url     = f"{SUPABASE_URL}/rest/v1/training_suggestions"
        headers = {
            "apikey":        SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type":  "application/json",
            "Prefer":        "return=representation"
        }
        params   = {"id": f"eq.{suggestion_id}"}
        body_req = {
            "status":             action,
            "supervisor_comment": comment,
            "updated_at":         datetime.now(timezone.utc).isoformat()
        }

        response = req.patch(url, headers=headers, params=params, json=body_req)

        if response.status_code in (200, 204):
            return {"message": f"Suggestion {action}"}, 200

        return {"message": f"Failed: {response.text}"}, 400
    except Exception as e:
        print(f"[ERROR] review_suggestion: {e}")
        return {"message": "Something went wrong. Please try again."}, 500


def mark_suggestions_viewed(employee_id):
    try:
        supabase.table("training_suggestions")\
            .update({"employee_viewed": True})\
            .eq("employee_id", employee_id)\
            .in_("status", ["approved", "rejected"])\
            .execute()

        return {"message": "Suggestions marked as viewed"}, 200
    except Exception as e:
        print(f"[ERROR] mark_suggestions_viewed: {e}")
        return {"message": "Something went wrong. Please try again."}, 500


def delete_training_attended(record_id):
    try:
        supabase.table("training_passport")\
            .delete()\
            .eq("id", record_id)\
            .execute()
        return {"message": "Training record deleted"}, 200
    except Exception as e:
        print(f"[ERROR] delete_training_attended: {e}")
        return {"message": "Something went wrong. Please try again."}, 500
