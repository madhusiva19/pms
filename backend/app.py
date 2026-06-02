"""
app.py  ←  Entry point only.

Responsibilities:
  1. Create the Flask app
  2. Register all blueprints
  3. Fix duplicate cycles on startup (data integrity only)
  4. Backfill missing dates on startup (never creates cycles)
  5. Start APScheduler (notifications + daily rollover backup)
  6. Launch dev server

POLICY:
  - Startup NEVER creates or rolls over cycles.
  - Rollover: primary = Supabase pg_cron daily at 00:05
              backup  = APScheduler daily at 00:05
"""

from flask import Flask
from flask_cors import CORS

# ── Notification blueprint and service ───────────────────────────────────────
from routes.notification_routes import notifications_bp
from services.notification_service import (
    init_notifications,
    start_scheduler,
    seed_notifications_for_cycle,
)

# ── Our blueprints ────────────────────────────────────────────────────────────
from routes.pms_cycle_routes  import pms_cycle_bp, init_pms_cycle_routes
from routes.template_routes   import template_bp
from routes.assignment_routes import assignment_bp
from routes.org_routes        import org_bp

# ── DB client ─────────────────────────────────────────────────────────────────
from models.supabase_client import supabase

# ── Startup helpers ───────────────────────────────────────────────────────────
from utils.startup_sync import (
    fix_duplicate_active_cycles,
    sync_cycle_dates_from_constants,
)

# ── Auto-rollover service (used by scheduler only) ────────────────────────────
from services.pms_cycle_service import auto_rollover_if_needed


# ─────────────────────────────────────────────────────────────────────────────
# APP FACTORY
# ─────────────────────────────────────────────────────────────────────────────

app = Flask(__name__)
CORS(app)

# Register all blueprints
app.register_blueprint(notifications_bp)
app.register_blueprint(pms_cycle_bp)
app.register_blueprint(template_bp)
app.register_blueprint(assignment_bp)
app.register_blueprint(org_bp)

# Wire seed function so cycle creation triggers notifications
init_pms_cycle_routes(seed_notifications_for_cycle)

# init_notifications is a no-op (kept for backward compatibility)
init_notifications(supabase)


# ─────────────────────────────────────────────────────────────────────────────
# STARTUP
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":

    # Step 1: Fix data integrity — deactivate duplicate active cycles
    fix_duplicate_active_cycles()

    # Step 2: Backfill any missing date fields on existing active cycle
    #         NEVER creates or rolls over cycles
    sync_cycle_dates_from_constants(seed_notifications_for_cycle)

    # Step 3: Start APScheduler
    #         Job 1 — daily notifications at 08:00
    #         Job 2 — daily rollover backup at 00:05
    #         Primary rollover is Supabase pg_cron — this is backup only
    start_scheduler(
        rollover_fn=lambda: auto_rollover_if_needed(seed_notifications_for_cycle)
    )

    app.run(debug=True)