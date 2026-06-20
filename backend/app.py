"""Flask entry point for the performance evaluation API."""

from flask import Flask, jsonify
from flask_cors import CORS

from routes import register_blueprints


def create_app():
    """Create the Flask app and register controller blueprints."""

    # Keep Flask construction here only. Routes and business logic live in
    # routes/ and services/ so this file stays as the application entry point.
    app = Flask(__name__)
    CORS(app)
    register_blueprints(app)

    # Return JSON for unknown API URLs so the frontend can show a readable error.
    @app.errorhandler(404)
    def not_found(_error):
        return jsonify({"error": "Endpoint not found"}), 404

    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True, port=5000)
