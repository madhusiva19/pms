import os
import requests as req
from models import supabase, SUPABASE_URL, SUPABASE_KEY
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


def login_user(body):
    try:
        email    = body.get("email", "").strip().lower()
        password = body.get("password", "").strip()

        if not email or not password:
            return {"message": "Email and password are required"}, 400

        auth_res = req.post(
            f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
            headers={
                "apikey":       SUPABASE_KEY,
                "Content-Type": "application/json"
            },
            json={"email": email, "password": password}
        )

        if auth_res.status_code != 200:
            return {"message": "Invalid email or password"}, 401

        auth_data = auth_res.json()
        auth_id   = auth_data.get("user", {}).get("id")

        if not auth_id:
            return {"message": "Authentication failed"}, 401

        user_res = supabase.table("users")\
            .select("*")\
            .eq("id", auth_id)\
            .execute()

        if not user_res.data:
            return {"message": "User profile not found"}, 404

        user      = user_res.data[0]
        role      = user.get("role")
        org_level = user.get("org_level")

        role_redirects = {
            "hq_admin":       "/hq-admin/dashboard",
            "country_admin":  "/country-admin/dashboard",
            "branch_admin":   "/branch-admin/dashboard",
            "dept_admin":     "/dept-admin/dashboard",
            "sub_dept_admin": "/sub-dept-admin/dashboard",
            "employee":       "/employee/profile",
        }

        redirect = role_redirects.get(role, "/employee/profile")

        return {
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
        }, 200
    except Exception as e:
        return {"message": str(e)}, 500


def forgot_password(body):
    try:
        email = body.get("email", "").strip().lower()

        if not email:
            return {"message": "Email is required"}, 400

        req.post(
            f"{SUPABASE_URL}/auth/v1/recover",
            headers={
                "apikey":       SUPABASE_KEY,
                "Content-Type": "application/json"
            },
            json={
                "email":       email,
                "redirect_to": f"{FRONTEND_URL}/reset-password"
            }
        )

        # Always return 200 — don't reveal if email exists (security)
        return {"message": "Reset link sent if account exists"}, 200
    except Exception as e:
        return {"message": str(e)}, 500


def reset_password(body):
    try:
        token_hash = body.get("token", "").strip()
        password   = body.get("password", "").strip()

        if not token_hash or not password:
            return {"message": "Token and password required"}, 400

        if len(password) < 8:
            return {"message": "Password must be at least 8 characters"}, 400

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

        if verify_res.status_code != 200:
            return {"message": "Reset link expired or invalid"}, 400

        access_token = verify_res.json().get("access_token")

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
            return {"message": "Password reset successfully"}, 200

        return {"message": "Reset failed"}, 400
    except Exception as e:
        return {"message": str(e)}, 500
