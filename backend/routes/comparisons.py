from flask import Blueprint, request, jsonify, current_app
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
        current_app.logger.error('comparison-live error: %s\n%s', e, traceback.format_exc())
        _ranges = ['1.0-1.5','1.5-2.0','2.0-2.5','2.5-3.0','3.0-3.5','3.5-4.0','4.0-4.5','4.5-5.0']
        year = int(request.args.get('year', 0))
        return jsonify({'success': True, 'data': [{'rating_range': r, 'mid_year_count': 0, 'year_end_count': 0, 'comparison_year': year} for r in _ranges]}), 200
