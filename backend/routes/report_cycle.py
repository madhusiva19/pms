from flask import Blueprint, jsonify
from lib.supabase_client import supabase
from datetime import datetime

report_cycle_bp = Blueprint('report_cycle', __name__)


@report_cycle_bp.route('/api/active-report-year', methods=['GET'])
def get_active_report_year():
    """
    Derives the active report year from the latest H1 data in performance_summaries.
    Active report year N means:
      - Mid-Year tab shows data from year N-1, period H1
      - Year-End tab shows data from year N, period H2
    When H1 data for year Y is added, active_report_year becomes Y+1.
    """
    try:
        result = supabase.table('performance_summaries').select('year').eq('period', 'H1').execute()
        h1_years = [r['year'] for r in result.data if r.get('year') is not None]
        if h1_years:
            latest_h1_year = max(h1_years)
        else:
            # No H1 data yet; fall back so active_report_year equals the current calendar year
            latest_h1_year = datetime.now().year - 1
        active_report_year = latest_h1_year + 1
        return jsonify({
            'success': True,
            'data': {
                'active_report_year': active_report_year,
                'mid_year_data_year': latest_h1_year,
                'year_end_data_year': active_report_year,
            },
        }), 200
    except Exception as e:
        import traceback
        return jsonify({'success': False, 'error': str(e), 'detail': traceback.format_exc()}), 500
