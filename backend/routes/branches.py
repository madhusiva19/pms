from flask import Blueprint, request, jsonify
import services.branch_service as branch_service

branches_bp = Blueprint('branches', __name__)


@branches_bp.route('/api/branches/<country_id>', methods=['GET'])
def get_branches(country_id: str):
    try:
        data = branch_service.get_branches_by_country(country_id, request.args.get('search'))
        return jsonify({'success': True, 'data': data, 'count': len(data)}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@branches_bp.route('/api/branch/<branch_id>', methods=['GET'])
def get_branch_details(branch_id: str):
    try:
        data = branch_service.get_branch_by_id(branch_id)
        if not data:
            return jsonify({'success': False, 'error': 'Branch not found'}), 404
        return jsonify({'success': True, 'data': data}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@branches_bp.route('/api/branch-by-code/<code>', methods=['GET'])
def get_branch_by_code(code: str):
    try:
        data = branch_service.get_branch_by_code(code)
        if not data:
            return jsonify({'success': False, 'error': 'Branch not found'}), 404
        return jsonify({'success': True, 'data': data}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@branches_bp.route('/api/branches', methods=['POST'])
def create_branch():
    try:
        body = request.json
        required = ['country_id', 'name', 'code', 'total_employees']
        if not all(f in body for f in required):
            return jsonify({'success': False, 'error': 'Missing required fields'}), 400
        data = branch_service.create_branch(body)
        return jsonify({'success': True, 'data': data}), 201
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@branches_bp.route('/api/dashboard/branch-summary/<branch_id>', methods=['GET'])
def get_branch_dashboard_summary(branch_id: str):
    try:
        data = branch_service.get_branch_dashboard_summary(branch_id)
        return jsonify({'success': True, 'data': data}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
