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

from routes.evaluator      import evaluator_bp
from routes.manual_rating  import manual_rating_bp
from routes.notifications  import notifications_bp
from routes.org            import org_bp
from routes.performance    import performance_bp
from routes.rating_periods import rating_periods_bp
from routes.templates      import templates_bp


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

    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=True, port=5000)