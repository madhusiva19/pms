from flask import Flask, request, jsonify
from flask_cors import CORS
import re
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)

CORS(app, resources={r"/api/*": {"origins": ["http://localhost:3000"]}})

# ── In-memory stores ──
achievements_store = {}   # email -> { achievement, status }

# ── Dummy users ──
USERS = {
    "hqadmin@dgl.com": {
        "password_hash": generate_password_hash("HQ@123"),
        "role": "HQ Admin",
        "name": "HQ Admin User"
    },
    "countryadmin@dgl.com": {
        "password_hash": generate_password_hash("Country@123"),
        "role": "Country Admin",
        "name": "Country Admin User"
    },
    "branchadmin@dgl.com": {
        "password_hash": generate_password_hash("Branch@123"),
        "role": "Branch Admin",
        "name": "Branch Admin User"
    },
    "deptadmin@dgl.com": {
        "password_hash": generate_password_hash("Dept@123"),
        "role": "Dept Admin",
        "name": "Dept Admin User"
    },
    "subdeptadmin@dgl.com": {
        "password_hash": generate_password_hash("Subdept@123"),
        "role": "Sub-Dept Admin",
        "name": "Sub-Dept Admin User"
    }
}

ROLE_REDIRECTS = {
    "HQ Admin": "/hq-admin/dashboard",
    "Country Admin": "/country-admin/dashboard",
    "Branch Admin": "/branch-admin/dashboard",
    "Dept Admin": "/dept-admin/dashboard",
    "Sub-Dept Admin": "/sub-dept-admin/dashboard",
}


def is_valid_email(email):
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None


# ── Health check ──
@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "service": "pms-backend"}), 200


# ── Login ──
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
        "message": "Login successful",
        "email": email,
        "name": user["name"],
        "role": user["role"],
        "token": "dummy-token",
        "redirectTo": ROLE_REDIRECTS.get(user["role"])
    }), 200


# ── HQ Admin: Save achievement (no approval needed) ──
@app.post("/api/profile/achievement")
def save_achievement():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    achievement = (data.get("achievement") or "").strip()

    if not email:
        return jsonify({"message": "Email is required"}), 400
    if not is_valid_email(email):
        return jsonify({"message": "Invalid email format"}), 400
    if not achievement:
        return jsonify({"message": "Achievement cannot be empty"}), 400
    if len(achievement) > 600:
        return jsonify({"message": "Achievement must be 600 characters or less"}), 400
    if email not in USERS:
        return jsonify({"message": "User not found"}), 404

    achievements_store[email] = {
        "achievement": achievement,
        "status": "saved"
    }

    return jsonify({
        "message": "Achievement saved successfully",
        "email": email,
        "achievement": achievement
    }), 200


# ── Get achievement ──
@app.get("/api/profile/achievement")
def get_achievement():
    email = (request.args.get("email") or "").strip().lower()

    if not email:
        return jsonify({"message": "Email is required"}), 400
    if email not in USERS:
        return jsonify({"message": "User not found"}), 404

    record = achievements_store.get(email)

    return jsonify({
        "email": email,
        "achievement": record["achievement"] if record else "",
        "status": record["status"] if record else None
    }), 200


# ── Country Admin: Submit achievement for approval ──
@app.post("/api/profile/achievement/submit")
def submit_achievement():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    achievement = (data.get("achievement") or "").strip()

    if not email:
        return jsonify({"message": "Email is required"}), 400
    if not is_valid_email(email):
        return jsonify({"message": "Invalid email format"}), 400
    if not achievement:
        return jsonify({"message": "Achievement cannot be empty"}), 400
    if len(achievement) > 600:
        return jsonify({"message": "Achievement must be 600 characters or less"}), 400
    if email not in USERS:
        return jsonify({"message": "User not found"}), 404
    if USERS[email]["role"] != "Country Admin":
        return jsonify({"message": "Only Country Admins can submit for approval"}), 403

    achievements_store[email] = {
        "achievement": achievement,
        "status": "pending"
    }

    return jsonify({
        "message": "Achievement submitted for approval",
        "email": email,
        "achievement": achievement,
        "status": "pending"
    }), 200


# ── HQ Admin: Get all pending achievements ──
@app.get("/api/profile/achievement/pending")
def get_pending_achievements():
    reviewer_email = (request.args.get("reviewer_email") or "").strip().lower()

    if not reviewer_email:
        return jsonify({"message": "Reviewer email is required"}), 400
    if reviewer_email not in USERS:
        return jsonify({"message": "Reviewer not found"}), 404
    if USERS[reviewer_email]["role"] != "HQ Admin":
        return jsonify({"message": "Only HQ Admins can review achievements"}), 403

    pending = [
        {
            "email": email,
            "name": USERS[email]["name"],
            "achievement": record["achievement"],
            "status": record["status"]
        }
        for email, record in achievements_store.items()
        if record["status"] == "pending"
    ]

    return jsonify({"pending": pending}), 200


# ── HQ Admin: Approve or Reject achievement ──
@app.post("/api/profile/achievement/review")
def review_achievement():
    data = request.get_json(silent=True) or {}
    reviewer_email = (data.get("reviewer_email") or "").strip().lower()
    target_email   = (data.get("target_email") or "").strip().lower()
    action         = (data.get("action") or "").strip().lower()

    if not reviewer_email or not target_email or not action:
        return jsonify({"message": "reviewer_email, target_email and action are required"}), 400
    if action not in ("approve", "reject"):
        return jsonify({"message": "Action must be 'approve' or 'reject'"}), 400
    if reviewer_email not in USERS:
        return jsonify({"message": "Reviewer not found"}), 404
    if USERS[reviewer_email]["role"] != "HQ Admin":
        return jsonify({"message": "Only HQ Admins can review achievements"}), 403
    if target_email not in achievements_store:
        return jsonify({"message": "No achievement found for this user"}), 404
    if achievements_store[target_email]["status"] != "pending":
        return jsonify({"message": "Achievement is not pending review"}), 400

    new_status = "approved" if action == "approve" else "rejected"
    achievements_store[target_email]["status"] = new_status

    return jsonify({
        "message": f"Achievement {new_status} successfully",
        "target_email": target_email,
        "status": new_status
    }), 200








#TEMPLATE MANAGEMENT_________________________________________________________________________________________________________________________




# ─────────────────────────────────────────────────────────────────────────────




if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)