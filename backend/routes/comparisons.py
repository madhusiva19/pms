from flask import Blueprint, request, jsonify
import services.comparison_service as comparison_service
from utils.helpers import execute_with_retry
from datetime import datetime

comparisons_bp = Blueprint('comparisons', __name__)


@comparisons_bp.route('/api/comparison-live', methods=['GET'])
def get_comparison_live():
    try:
        scope_id = request.args.get('scope_id')
        if not scope_id:
            return jsonify({'success': False, 'error': 'scope_id is required'}), 400
        data = execute_with_retry(lambda: comparison_service.get_comparison_live(
            year=int(request.args.get('year', datetime.now().year)),
            scope=request.args.get('scope', 'country'),
            scope_id=scope_id,
        ))
        return jsonify({'success': True, 'data': data}), 200
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        import traceback
        return jsonify({'success': False, 'error': str(e), 'detail': traceback.format_exc()}), 500
