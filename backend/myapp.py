"""
app.py  ←  Entry point only.

Responsibilities:
  1. Create the Flask app
  2. Register all blueprints
  3. Run startup sync (duplicate-cycle fix + date backfill/rollover)
  4. Start the APScheduler
  5. Launch the dev server (when run directly)

No business logic lives here.
"""

from flask import Flask
from flask_cors import CORS

# ── Notification blueprint (your teammate's existing module) ──────────────────
from notification_routes import (
    notifications_bp,
    init_notifications,
    start_scheduler,
    seed_notifications_for_cycle,
)

# ── Our blueprints ─────────────────────────────────────────────────────────────
from routes.pms_cycle_routes   import pms_cycle_bp,   init_pms_cycle_routes
from routes.template_routes    import template_bp
from routes.assignment_routes  import assignment_bp
from routes.org_routes         import org_bp

# ── DB client (needed to init notifications) ───────────────────────────────────
from models.supabase_client import supabase

# ── Startup helpers ────────────────────────────────────────────────────────────
from utils.startup_sync import fix_duplicate_active_cycles, sync_cycle_dates_from_constants


# ─────────────────────────────────────────────────────────────────────────────
# APP FACTORY
# ─────────────────────────────────────────────────────────────────────────────

app = Flask(__name__)
CORS(app)

# Register blueprints
app.register_blueprint(notifications_bp)
app.register_blueprint(pms_cycle_bp)
app.register_blueprint(template_bp)
app.register_blueprint(assignment_bp)
app.register_blueprint(org_bp)

# Wire seed function into pms_cycle_routes so cycle creation triggers notifications
init_pms_cycle_routes(seed_notifications_for_cycle)

# Init notifications with the shared supabase client
init_notifications(supabase)


# ─────────────────────────────────────────────────────────────────────────────
# STARTUP
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    fix_duplicate_active_cycles()
    sync_cycle_dates_from_constants(seed_notifications_for_cycle)
    start_scheduler()
    app.run(debug=True)
