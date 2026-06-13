"""
app.py
-------
Flask application entry point.

This file is intentionally thin — it only:
  1. Creates the Flask app
  2. Enables CORS
  3. Registers all route blueprints
  4. Starts the background scheduler

All business logic lives in services/.
All database access lives in utils/db.py.
All route handlers live in routes/.
"""

import logging

from flask import Flask
from flask_cors import CORS

from routes.evaluator_routes        import evaluator_bp
from routes.manual_rating_routes    import manual_rating_bp
from routes.notifications_routes    import notifications_bp
from routes.org_routes              import org_bp
from routes.performance_routes      import performance_bp
from routes.rating_periods_routes   import rating_periods_bp
from routes.templates_routes        import templates_bp
from routes.workforce_report_routes import workforce_report_bp

from scheduler import init_scheduler

logging.basicConfig(level=logging.INFO)


def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app)

    app.register_blueprint(evaluator_bp)
    app.register_blueprint(manual_rating_bp)
    app.register_blueprint(notifications_bp)
    app.register_blueprint(org_bp)
    app.register_blueprint(performance_bp)
    app.register_blueprint(rating_periods_bp)
    app.register_blueprint(templates_bp)
    app.register_blueprint(workforce_report_bp)

    return app


app = create_app()

# Start the background scheduler once (not in debug reloader child process)
import os
if not app.debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
    _scheduler = init_scheduler()

if __name__ == "__main__":
    app.run(debug=True, port=5000)