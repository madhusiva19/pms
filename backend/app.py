from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os

load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:3000"]}})

from routes import auth_bp, profile_bp, diary_bp, notification_bp, training_bp, dashboard_bp

app.register_blueprint(auth_bp)
app.register_blueprint(profile_bp)
app.register_blueprint(diary_bp)
app.register_blueprint(notification_bp)
app.register_blueprint(training_bp)
app.register_blueprint(dashboard_bp)


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "service": "pms-backend"}), 200


@app.get("/api/debug-env")
def debug_env():
    return jsonify({
        "url":        os.getenv("SUPABASE_URL"),
        "key_exists": bool(os.getenv("SUPABASE_KEY"))
    }), 200


if __name__ == "__main__":
    # start_scheduler()  # Uncomment in production
    app.run(host="127.0.0.1", port=5000, debug=True)
