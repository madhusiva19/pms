from flask import Blueprint, jsonify
from models.supabase_client import supabase
from datetime import datetime

report_cycle_bp = Blueprint('report_cycle', __name__)


@report_cycle_bp.route('/api/active-report-year', methods=['GET'])
def get_active_report_year():
    """
    Returns the report year whose data should be displayed on the Reports pages.

    Normally this is the pms_cycles row WHERE is_active=true. But a cycle only
    starts producing real performance_summaries rows after its mid_year_review
    checkpoint passes (that's when H1 ratings are actually entered) — before
    that date the active cycle is empty, so reports would show all zeros even
    though the previous cycle's H1/H2 results are still available.
    To avoid that, if today is earlier than the active cycle's mid_year_review
    date, fall back to the most recent previous cycle's pms_year instead.
    This does not affect pms_cycles.is_active or the objective-setting/rollover
    logic — it only changes which year's data the Reports pages query.
    """
    try:
        result = (
            supabase.table('pms_cycles')
            .select('pms_year, mid_year_review, is_active')
            .order('pms_year', desc=True)
            .execute()
        )
        rows = result.data or []
        active = next((r for r in rows if r.get('is_active')), None)

        if active:
            active_report_year = active['pms_year']
            mid_year_review = active.get('mid_year_review')
            if mid_year_review and datetime.now().date() < datetime.fromisoformat(str(mid_year_review)[:10]).date():
                previous = next((r for r in rows if r['pms_year'] < active['pms_year']), None)
                if previous:
                    active_report_year = previous['pms_year']
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
