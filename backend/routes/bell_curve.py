from flask import Blueprint, request, jsonify
import services.bell_curve_service as bell_curve_service
from utils.helpers import execute_with_retry
from datetime import datetime

bell_curve_bp = Blueprint('bell_curve', __name__)


@bell_curve_bp.route('/api/bell-curve-live', methods=['GET'])
def get_bell_curve_live():
    try:
        scope_id = request.args.get('scope_id')
        if not scope_id:
            return jsonify({'success': False, 'error': 'scope_id is required'}), 400
        result = execute_with_retry(lambda: bell_curve_service.get_bell_curve_live(
            period_type=request.args.get('period_type', 'mid_year'),
            year=int(request.args.get('year', datetime.now().year)),
            scope=request.args.get('scope', 'country'),
            scope_id=scope_id,
        ))
        return jsonify({'success': True, **result}), 200
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        import traceback
        return jsonify({'success': False, 'error': str(e), 'detail': traceback.format_exc()}), 500
