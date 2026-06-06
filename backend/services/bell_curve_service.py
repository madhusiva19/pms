from lib.supabase_client import supabase
from utils.helpers import resolve_emp_ids_by_scope, calculate_bell_curve_from_scores, get_period_dates


def get_bell_curve_live(period_type: str, year: int, scope: str, scope_id: str) -> dict:
    # year is the display/report year (e.g. 2026).
    # Mid-year maps to the previous year's H1; year-end maps to the current report year's H2.
    # This matches the performance cycle: report year N covers N-1 H1 (mid) and N H2 (year-end).
    if period_type == 'mid_year':
        db_year, db_period = year - 1, 'H1'
    else:
        db_year, db_period = year, 'H2'
    start_date, end_date = get_period_dates(period_type, db_year)

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
        .eq('year', db_year)
        .eq('period', db_period)
        .in_('user_id', emp_ids)
        .execute()
    )

    return {
        # calculate_bell_curve_from_scores groups raw scores into histogram buckets
        'data': calculate_bell_curve_from_scores(records.data),
        'total_employees': len(records.data),
        'period_type': period_type,
        'year': year,
        'scope': scope,
        'date_range': {'start': start_date, 'end': end_date},
    }
