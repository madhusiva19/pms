from flask import Blueprint, request, jsonify
import services.report_service as report_service

reports_bp = Blueprint('reports', __name__)


@reports_bp.route('/api/reports/<country_id>', methods=['GET'])
def get_country_reports(country_id: str):
    try:
        year = int(request.args['year']) if request.args.get('year') else None
        data = report_service.get_country_reports(country_id, request.args.get('report_type'), year)
        return jsonify({'success': True, 'data': data, 'count': len(data)}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@reports_bp.route('/api/reports', methods=['POST'])
def create_performance_report():
    try:
        body = request.json
        if not all(f in body for f in ['country_id', 'report_type', 'report_year']):
            return jsonify({'success': False, 'error': 'Missing required fields'}), 400
        return jsonify({'success': True, 'data': report_service.create_performance_report(body)}), 201
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@reports_bp.route('/api/reports/<report_id>', methods=['PUT'])
def update_performance_report(report_id: str):
    try:
        data = report_service.update_performance_report(report_id, request.json)
        if not data:
            return jsonify({'success': False, 'error': 'Report not found'}), 404
        return jsonify({'success': True, 'data': data}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@reports_bp.route('/api/insights/<report_id>', methods=['GET'])
def get_ai_insights(report_id: str):
    try:
        return jsonify({'success': True, 'data': report_service.get_ai_insights(report_id)}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@reports_bp.route('/api/branches/<branch_id>/reports', methods=['GET'])
def get_branch_reports(branch_id: str):
    try:
        year = int(request.args['year']) if request.args.get('year') else None
        data = report_service.get_branch_reports(branch_id, request.args.get('report_type'), year)
        return jsonify({'success': True, 'data': data, 'count': len(data)}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@reports_bp.route('/api/branch-reports/<branch_id>', methods=['GET'])
def get_branch_reports_alt(branch_id: str):
    try:
        year = int(request.args['year']) if request.args.get('year') else None
        data = report_service.get_branch_reports(branch_id, request.args.get('report_type'), year)
        return jsonify({'success': True, 'data': data}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@reports_bp.route('/api/branch-reports', methods=['POST'])
def create_branch_performance_report():
    try:
        body = request.json
        if not all(f in body for f in ['branch_id', 'country_id', 'report_type', 'report_year']):
            return jsonify({'success': False, 'error': 'Missing required fields'}), 400
        return jsonify({'success': True, 'data': report_service.create_branch_report(body)}), 201
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@reports_bp.route('/api/branch-reports/<report_id>', methods=['PUT'])
def update_branch_performance_report(report_id: str):
    try:
        data = report_service.update_branch_report(report_id, request.json)
        if not data:
            return jsonify({'success': False, 'error': 'Report not found'}), 404
        return jsonify({'success': True, 'data': data}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@reports_bp.route('/api/branch-insights/<report_id>', methods=['GET'])
def get_branch_ai_insights(report_id: str):
    try:
        return jsonify({'success': True, 'data': report_service.get_branch_ai_insights(report_id)}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@reports_bp.route('/api/report-metrics', methods=['GET'])
def get_report_metrics():
    try:
        scope_id = request.args.get('scope_id')
        if not scope_id:
            return jsonify({'success': False, 'error': 'scope_id is required'}), 400
        from datetime import datetime
        data = report_service.get_report_metrics(
            period_type=request.args.get('period_type', 'mid_year'),
            year=int(request.args.get('year', datetime.now().year)),
            scope=request.args.get('scope', 'country'),
            scope_id=scope_id,
            employee_id=request.args.get('employee_id'),
        )
        return jsonify({'success': True, 'data': data}), 200
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        import traceback
        return jsonify({'success': False, 'error': str(e), 'detail': traceback.format_exc()}), 500
