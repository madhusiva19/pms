from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os

load_dotenv()

# ── Notification blueprint and service ───────────────────────────────────────
from routes.notification_routes import notifications_bp
from services.notification_service import (
    init_notifications,
    start_scheduler,
    seed_notifications_for_cycle,
)

# ── Your blueprints ───────────────────────────────────────────────────────────
from routes.pms_cycle_routes  import pms_cycle_bp, init_pms_cycle_routes
from routes.template_routes   import template_bp
from routes.assignment_routes import assignment_bp
from routes.org_routes        import org_bp
from routes.approval_routes import approval_bp
from routes.enquiry_routes import enquiry_bp
from routes.evaluation_routes import evaluation_bp
from routes.evaluation_status_routes import evaluation_status_bp
from routes.evaluation_notification_routes import evaluation_notification_bp
from routes.performance_routes import performance_bp
from routes.team_member_routes import team_member_bp

# ── Dev-final's blueprints ────────────────────────────────────────────────────
from routes import auth_bp, profile_bp, diary_bp, notification_bp, training_bp, dashboard_bp

# ── DB client ─────────────────────────────────────────────────────────────────
from models.supabase_client import supabase

# ── Startup helpers ───────────────────────────────────────────────────────────
from utils.startup_sync import (
    fix_duplicate_active_cycles,
    sync_cycle_dates_from_constants,
)
from services.pms_cycle_service import auto_rollover_if_needed


# ─────────────────────────────────────────────────────────────────────────────
# APP FACTORY
# ─────────────────────────────────────────────────────────────────────────────

app = Flask(__name__)
CORS(app)

# Register your blueprints
app.register_blueprint(notifications_bp)
app.register_blueprint(pms_cycle_bp)
app.register_blueprint(template_bp)
app.register_blueprint(assignment_bp)
app.register_blueprint(org_bp)
app.register_blueprint(team_member_bp)
app.register_blueprint(approval_bp)
app.register_blueprint(evaluation_notification_bp)
app.register_blueprint(enquiry_bp)
app.register_blueprint(evaluation_status_bp)
app.register_blueprint(performance_bp)
app.register_blueprint(evaluation_bp)

# Register dev-final's blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(profile_bp)
app.register_blueprint(diary_bp)
app.register_blueprint(notification_bp)
app.register_blueprint(training_bp)
app.register_blueprint(dashboard_bp)

# Wire seed function so cycle creation triggers notifications
init_pms_cycle_routes(seed_notifications_for_cycle)
init_notifications(supabase)


# ─────────────────────────────────────────────────────────────────────────────
# HEALTH CHECK
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "service": "pms-backend"}), 200


# ─────────────────────────────────────────────────────────────────────────────
# STARTUP
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    fix_duplicate_active_cycles()
    sync_cycle_dates_from_constants(seed_notifications_for_cycle)
    start_scheduler(
        rollover_fn=lambda: auto_rollover_if_needed(seed_notifications_for_cycle)
    )
    app.run(host="127.0.0.1", port=5000, debug=True)


