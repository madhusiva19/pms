from flask import Blueprint, jsonify
import services.department_service as department_service

departments_bp = Blueprint('departments', __name__)


@departments_bp.route('/api/departments/branch/<branch_id>', methods=['GET'])
def get_departments_by_branch(branch_id: str):
    try:
        return jsonify({'success': True, 'data': department_service.get_departments_by_branch(branch_id)}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@departments_bp.route('/api/departments/<dept_id>', methods=['GET'])
def get_department(dept_id: str):
    try:
        return jsonify({'success': True, 'data': department_service.get_department_by_id(dept_id)}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@departments_bp.route('/api/sub-departments/dept/<dept_id>', methods=['GET'])
def get_sub_departments_by_dept(dept_id: str):
    try:
        return jsonify({'success': True, 'data': department_service.get_sub_departments_by_dept(dept_id)}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@departments_bp.route('/api/sub-departments/<sub_dept_id>', methods=['GET'])
def get_sub_department(sub_dept_id: str):
    try:
        return jsonify({'success': True, 'data': department_service.get_sub_department_by_id(sub_dept_id)}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
