from lib.supabase_client import supabase
from utils.helpers import resolve_emp_ids_by_scope, calculate_bell_curve_from_scores, get_period_dates


def get_bell_curve_live(period_type: str, year: int, scope: str, scope_id: str) -> dict:
    period_map = {'mid_year': 'H1', 'year_end': 'H2'}
    db_period = period_map.get(period_type, period_type)
    start_date, end_date = get_period_dates(period_type, year)

    emp_ids = resolve_emp_ids_by_scope(scope, scope_id)
    if not emp_ids:
        return {
            'data': [], 'total_employees': 0,
            'period_type': period_type, 'year': year, 'scope': scope,
            'date_range': {'start': start_date, 'end': end_date},
        }

    records = (
        supabase.table('performance_summaries')
        .select('user_id, total_score, period, year')
        .eq('year', year)
        .eq('period', db_period)
        .in_('user_id', emp_ids)
        .execute()
    )

    return {
        'data': calculate_bell_curve_from_scores(records.data),
        'total_employees': len(records.data),
        'period_type': period_type,
        'year': year,
        'scope': scope,
        'date_range': {'start': start_date, 'end': end_date},
    }
