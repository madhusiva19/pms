from flask import Blueprint, request, jsonify
import services.employee_service as employee_service
from datetime import datetime

employees_bp = Blueprint('employees', __name__)


@employees_bp.route('/api/employees/sub-dept/<sub_dept_id>', methods=['GET'])
def get_employees_by_sub_dept(sub_dept_id: str):
    try:
        return jsonify({'success': True, 'data': employee_service.get_employees_by_sub_dept(sub_dept_id)}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@employees_bp.route('/api/employees/<emp_id>', methods=['GET'])
def get_employee(emp_id: str):
    try:
        return jsonify({'success': True, 'data': employee_service.get_employee_by_id(emp_id)}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@employees_bp.route('/api/performance-summaries/user/<user_id>', methods=['GET'])
def get_performance_summaries_by_user(user_id: str):
    try:
        year = int(request.args.get('year', datetime.now().year))
        return jsonify({'success': True, 'data': employee_service.get_performance_summaries(user_id, year)}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
