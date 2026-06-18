"""
Flask Backend for Performance Management System
"""

from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os

load_dotenv()

# ── Notification blueprint and service ────────────────────────────────────────
from routes.notification_routes import notifications_bp
from services.notification_service import (
    init_notifications,
    start_scheduler,
    seed_notifications_for_cycle,
)

# ── Dev-final's blueprints ────────────────────────────────────────────────────
from routes.pms_cycle_routes  import pms_cycle_bp, init_pms_cycle_routes
from routes.template_routes   import template_bp
from routes.assignment_routes import assignment_bp
from routes.org_routes        import org_bp
from routes import auth_bp, profile_bp, diary_bp, notification_bp, training_bp, dashboard_bp

#  (Dashboard & Reporting) ─────────────────────────────
from routes.countries            import countries_bp
from routes.branches             import branches_bp
from routes.reports              import reports_bp
from routes.departments          import departments_bp
from routes.employees            import employees_bp
from routes.bell_curve           import bell_curve_bp
from routes.comparisons          import comparisons_bp
from routes.saved_reports        import saved_reports_bp
from routes.potential_assessment import potential_assessment_bp
from routes.report_cycle         import report_cycle_bp

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

# Register dev-final's blueprints
app.register_blueprint(notification_bp)
app.register_blueprint(notifications_bp)
app.register_blueprint(pms_cycle_bp)
app.register_blueprint(template_bp)
app.register_blueprint(assignment_bp)
app.register_blueprint(org_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(profile_bp)
app.register_blueprint(diary_bp)
app.register_blueprint(training_bp)
app.register_blueprint(dashboard_bp)

# Register reporting and dashboard blueprints
app.register_blueprint(countries_bp)
app.register_blueprint(branches_bp)
app.register_blueprint(reports_bp)
app.register_blueprint(departments_bp)
app.register_blueprint(employees_bp)
app.register_blueprint(bell_curve_bp)
app.register_blueprint(comparisons_bp)
app.register_blueprint(saved_reports_bp)
app.register_blueprint(potential_assessment_bp)
app.register_blueprint(report_cycle_bp)

# Wire seed function so cycle creation triggers notifications
init_pms_cycle_routes(seed_notifications_for_cycle)
init_notifications(supabase)

# ── DB WARMUP (runs under WSGI/Gunicorn too) ──────────────────────────────────
with app.app_context():
    try:
        supabase.table('users').select('id').limit(1).execute()
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────────────────────
# HEALTH CHECK + ERROR HANDLERS
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "service": "pms-backend"}), 200


@app.errorhandler(404)
def not_found(error):
    return jsonify({'success': False, 'error': 'Endpoint not found'}), 404


@app.errorhandler(500)
def internal_error(error):
    app.logger.error("500 Internal Server Error: %s", error, exc_info=True)
    return jsonify({'success': False, 'error': 'Internal server error'}), 500


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