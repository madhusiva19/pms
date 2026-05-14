"""
Flask Backend for Performance Management System - Dashboard & Reporting Module
Author: Sanduni
Description: RESTful API for managing performance reports, bell curve analytics, and dashboards
"""

from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

from routes.countries import countries_bp
from routes.branches import branches_bp
from routes.reports import reports_bp
from routes.departments import departments_bp
from routes.employees import employees_bp
from routes.bell_curve import bell_curve_bp
from routes.comparisons import comparisons_bp
from routes.saved_reports import saved_reports_bp
from routes.potential_assessment import potential_assessment_bp

load_dotenv()

app = Flask(__name__)
CORS(app)

app.register_blueprint(countries_bp)
app.register_blueprint(branches_bp)
app.register_blueprint(reports_bp)
app.register_blueprint(departments_bp)
app.register_blueprint(employees_bp)
app.register_blueprint(bell_curve_bp)
app.register_blueprint(comparisons_bp)
app.register_blueprint(saved_reports_bp)
app.register_blueprint(potential_assessment_bp)


@app.route('/api/health', methods=['GET'])
def health_check():
    from datetime import datetime
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'service': 'PMS Dashboard & Reporting API',
    }), 200


@app.errorhandler(404)
def not_found(error):
    return jsonify({'success': False, 'error': 'Endpoint not found'}), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({'success': False, 'error': 'Internal server error'}), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
