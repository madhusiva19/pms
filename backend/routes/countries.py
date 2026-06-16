from flask import Blueprint, request, jsonify
import services.country_service as country_service

countries_bp = Blueprint('countries', __name__)


@countries_bp.route('/api/countries', methods=['GET'])
def get_countries():
    try:
        data = country_service.get_all_countries()
        return jsonify({'success': True, 'data': data, 'count': len(data)}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@countries_bp.route('/api/countries/<country_id>', methods=['GET'])
def get_country_details(country_id: str):
    try:
        data = country_service.get_country_by_id(country_id)
        if not data:
            return jsonify({'success': False, 'error': 'Country not found'}), 404
        return jsonify({'success': True, 'data': data}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@countries_bp.route('/api/countries', methods=['POST'])
def create_country():
    try:
        body = request.json
        required = ['name', 'code', 'total_employees', 'total_branches']
        if not all(f in body for f in required):
            return jsonify({'success': False, 'error': 'Missing required fields'}), 400
        data = country_service.create_country(body)
        return jsonify({'success': True, 'data': data}), 201
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@countries_bp.route('/api/dashboard/summary/<country_id>', methods=['GET'])
def get_dashboard_summary(country_id: str):
    try:
        data = country_service.get_dashboard_summary(country_id)
        return jsonify({'success': True, 'data': data}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
