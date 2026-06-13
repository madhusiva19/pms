from flask import Blueprint, jsonify
from models.supabase_client import supabase
from datetime import datetime

report_cycle_bp = Blueprint('report_cycle', __name__)


@report_cycle_bp.route('/api/active-report-year', methods=['GET'])
def get_active_report_year():
    """
    Returns the active report year from pms_cycles WHERE is_active=true.
    Both H1 (mid-year) and H2 (year-end) for that year share the same pms_year value.
    When the cycle advances (e.g. 2027 becomes active), pms_cycles is updated accordingly.
    """
    try:
        result = supabase.table('pms_cycles').select('pms_year').eq('is_active', True).limit(1).execute()
        if result.data:
            active_report_year = result.data[0]['pms_year']
        else:
            active_report_year = datetime.now().year
        return jsonify({
            'success': True,
            'data': {
                'active_report_year': active_report_year,
            },
        }), 200
    except Exception as e:
        import traceback
        return jsonify({'success': False, 'error': str(e), 'detail': traceback.format_exc()}), 500
