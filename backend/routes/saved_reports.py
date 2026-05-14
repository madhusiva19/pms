from flask import Blueprint, request, jsonify
import services.saved_report_service as saved_report_service

saved_reports_bp = Blueprint('saved_reports', __name__)


@saved_reports_bp.route('/api/saved-reports', methods=['GET'])
def list_saved_reports():
    try:
        user_id = request.args.get('user_id')
        if not user_id:
            return jsonify({'success': False, 'error': 'user_id query parameter required'}), 400
        data = saved_report_service.list_saved_reports(
            user_id=user_id,
            report_type=request.args.get('report_type'),
            country_id=request.args.get('country_id'),
            branch_id=request.args.get('branch_id'),
            limit=int(request.args.get('limit', 50)),
            offset=int(request.args.get('offset', 0)),
        )
        return jsonify({'success': True, 'data': data, 'count': len(data)}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@saved_reports_bp.route('/api/saved-reports', methods=['POST'])
def create_saved_report():
    try:
        body = request.json
        required = ['user_id', 'report_name', 'report_type', 'report_period', 'report_year']
        if not all(f in body for f in required):
            return jsonify({'success': False, 'error': f'Missing required fields. Required: {required}'}), 400
        if not body.get('country_id') and not body.get('branch_id'):
            return jsonify({'success': False, 'error': 'Either country_id or branch_id is required'}), 400
        if body.get('is_trend_report') and len(body.get('selected_periods', [])) < 2:
            return jsonify({'success': False, 'error': 'Trend reports require at least 2 selected periods'}), 400
        data = saved_report_service.create_saved_report(body)
        return jsonify({'success': True, 'data': data}), 201
    except Exception as e:
        return jsonify({'success': False, 'error': str(e), 'details': repr(e)}), 500


@saved_reports_bp.route('/api/saved-reports/<saved_report_id>', methods=['GET'])
def get_saved_report(saved_report_id: str):
    try:
        data = saved_report_service.get_saved_report_by_id(saved_report_id)
        if not data:
            return jsonify({'success': False, 'error': 'Saved report not found'}), 404
        return jsonify({'success': True, 'data': data}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@saved_reports_bp.route('/api/saved-reports/<saved_report_id>', methods=['PUT'])
def update_saved_report(saved_report_id: str):
    try:
        data = saved_report_service.update_saved_report(saved_report_id, request.json)
        if not data:
            return jsonify({'success': False, 'error': 'Saved report not found'}), 404
        return jsonify({'success': True, 'data': data}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@saved_reports_bp.route('/api/saved-reports/<saved_report_id>', methods=['DELETE'])
def delete_saved_report(saved_report_id: str):
    try:
        saved_report_service.delete_saved_report(saved_report_id)
        return jsonify({'success': True, 'message': 'Saved report deleted successfully'}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@saved_reports_bp.route('/api/saved-reports/<saved_report_id>/download', methods=['POST'])
def log_saved_report_download(saved_report_id: str):
    try:
        body = request.json
        if not body.get('user_id'):
            return jsonify({'success': False, 'error': 'user_id is required'}), 400
        data = saved_report_service.log_download(saved_report_id, body['user_id'], body.get('file_format', 'pdf'), body.get('user_email'))
        return jsonify({'success': True, 'data': data}), 201
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@saved_reports_bp.route('/api/saved-reports/<saved_report_id>/downloads', methods=['GET'])
def get_saved_report_downloads(saved_report_id: str):
    try:
        data = saved_report_service.get_downloads(saved_report_id)
        return jsonify({'success': True, 'data': data, 'count': len(data)}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@saved_reports_bp.route('/api/saved-reports/<saved_report_id>/share', methods=['POST'])
def share_saved_report(saved_report_id: str):
    try:
        body = request.json
        if not body.get('shared_with_emails'):
            return jsonify({'success': False, 'error': 'shared_with_emails is required'}), 400
        data = saved_report_service.share_saved_report(saved_report_id, body['shared_with_emails'])
        if not data:
            return jsonify({'success': False, 'error': 'Saved report not found'}), 404
        return jsonify({'success': True, 'data': data}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@saved_reports_bp.route('/api/saved-reports/<saved_report_id>/trend-data', methods=['GET'])
def get_trend_analysis_data(saved_report_id: str):
    try:
        data = saved_report_service.get_trend_analysis(saved_report_id)
        return jsonify({'success': True, 'data': data}), 200
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
