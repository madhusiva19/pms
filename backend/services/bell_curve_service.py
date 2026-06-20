from models.supabase_client import supabase
from utils.helpers import resolve_emp_ids_by_scope, fetch_summaries_for_ids, calculate_bell_curve_from_scores, get_period_dates


def get_bell_curve_live(period_type: str, year: int, scope: str, scope_id: str) -> dict:
    # year is the active report year (e.g. 2026).
    # Both H1 (mid-year) and H2 (year-end) are stored with pms_year=year — same year, different period.
    db_period = 'H1' if period_type == 'mid_year' else 'H2'
    start_date, end_date = get_period_dates(period_type, year)

    emp_ids = resolve_emp_ids_by_scope(scope, scope_id)
    if not emp_ids:
        return {
            'data': [], 'total_employees': 0,
            'period_type': period_type, 'year': year, 'scope': scope,
            'date_range': {'start': start_date, 'end': end_date},
        }

    all_rows = fetch_summaries_for_ids(emp_ids, year, db_period, columns='user_id, total_score, period, pms_year')

    return {
        # calculate_bell_curve_from_scores groups raw scores into histogram buckets
        'data': calculate_bell_curve_from_scores(all_rows),
        'total_employees': len(all_rows),
        'period_type': period_type,
        'year': year,
        'scope': scope,
        'date_range': {'start': start_date, 'end': end_date},
    }
