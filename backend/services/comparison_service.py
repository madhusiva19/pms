from lib.supabase_client import supabase
from utils.helpers import resolve_emp_ids_by_scope, calculate_bell_curve_from_scores

_RATING_RANGES = ['1.0-1.5', '1.5-2.0', '2.0-2.5', '2.5-3.0',
                  '3.0-3.5', '3.5-4.0', '4.0-4.5', '4.5-5.0']


def get_comparison_live(year: int, scope: str, scope_id: str) -> list:
    emp_ids = resolve_emp_ids_by_scope(scope, scope_id)
    if not emp_ids:
        return []

    h1 = supabase.table('performance_summaries').select('total_score').eq('year', year).eq('period', 'H1').in_('user_id', emp_ids).execute()
    h2 = supabase.table('performance_summaries').select('total_score').eq('year', year).eq('period', 'H2').in_('user_id', emp_ids).execute()

    h1_by_range = {d['rating_range']: d['employee_count'] for d in calculate_bell_curve_from_scores(h1.data)}
    h2_by_range = {d['rating_range']: d['employee_count'] for d in calculate_bell_curve_from_scores(h2.data)}

    return [
        {
            'rating_range': rr,
            'mid_year_count': h1_by_range.get(rr, 0),
            'year_end_count': h2_by_range.get(rr, 0),
            'comparison_year': year,
        }
        for rr in _RATING_RANGES
    ]
