import requests as req
from datetime import datetime
from models import supabase, SUPABASE_URL, SUPABASE_KEY, SERVICE_KEY


def get_profile(employee_id):
    try:
        result = supabase.table("users")\
            .select("*, designations!fk_designation(name)")\
            .eq("id", employee_id)\
            .execute()

        if not result.data:
            return {"message": "User not found"}, 404

        profile = result.data[0]
        if profile.get("designations"):
            profile["designation"] = profile["designations"]["name"]

        return {"profile": profile}, 200
    except Exception as e:
        return {"message": str(e)}, 500


def upload_avatar(request):
    try:
        employee_id = request.form.get("employee_id")
        file        = request.files.get("file")

        if not file or not employee_id:
            return {"message": "File and employee_id required"}, 400

        allowed_types = ["image/jpeg", "image/png", "image/webp"]
        if file.content_type not in allowed_types:
            return {"message": "Only JPG, PNG, WebP allowed"}, 400

        file_bytes = file.read()
        if len(file_bytes) > 2 * 1024 * 1024:
            return {"message": "Image must be under 2MB"}, 400

        ext       = file.filename.split(".")[-1].lower()
        file_name = f"{employee_id}-{int(datetime.now().timestamp())}.{ext}"

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
            return {"message": f"Upload failed: {upload_res.text}"}, 400

        avatar_url = f"{SUPABASE_URL}/storage/v1/object/public/avatars/{file_name}"

        supabase.table("users")\
            .update({"avatar_url": avatar_url})\
            .eq("id", employee_id)\
            .execute()

        return {"avatar_url": avatar_url}, 200
    except Exception as e:
        return {"message": str(e)}, 500


def remove_avatar(employee_id):
    try:
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

        supabase.table("users")\
            .update({"avatar_url": None})\
            .eq("id", employee_id)\
            .execute()

        return {"message": "Avatar removed"}, 200
    except Exception as e:
        return {"message": str(e)}, 500
