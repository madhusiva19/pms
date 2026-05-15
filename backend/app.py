"""
app.py
-------
Flask application entry point.

This file is intentionally thin — it only:
  1. Creates the Flask app
  2. Enables CORS
  3. Registers all route blueprints

All business logic lives in services/.
All database access lives in utils/db.py.
All route handlers live in routes/.
"""

from flask import Flask
from flask_cors import CORS

from routes.evaluator     import evaluator_bp
from routes.notifications import notifications_bp
from routes.org           import org_bp
from routes.performance   import performance_bp
from routes.templates     import templates_bp

# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------

def create_app() -> Flask:
    """
    Build and configure the Flask application.

    Splitting creation into a factory function makes it easy to instantiate
    the app with different configs in tests without running the server.
    """
    app = Flask(__name__)

    # Allow requests from any origin (tighten this in production)
    CORS(app)

    # Register all blueprints — each brings its own set of URL rules
    app.register_blueprint(templates_bp)
    app.register_blueprint(performance_bp)
    app.register_blueprint(evaluator_bp)
    app.register_blueprint(notifications_bp)
    app.register_blueprint(org_bp)

    return app


# ---------------------------------------------------------------------------
# Development server entry point
# ---------------------------------------------------------------------------

app = create_app()

if __name__ == "__main__":
    # debug=True enables auto-reload and the interactive debugger.
    # Never use debug=True in production.
    app.run(debug=True, port=5000)
