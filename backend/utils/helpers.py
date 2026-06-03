"""
Shared helper functions used across services and routes.
"""

import time
from lib.supabase_client import supabase


def execute_with_retry(fn, retries: int = 2, delay: float = 0.6):
    """Call fn(); on exception wait delay seconds and retry up to retries times."""
    last_err = None
    for attempt in range(retries):
        try:
            return fn()
        except Exception as e:
            last_err = e
            if attempt < retries - 1:
                time.sleep(delay)
    raise last_err


_SCOPE_FIELD_MAP = {
    'country': 'country_id',
    'branch': 'branch_id',
    'department': 'department_id',
    'sub_department': 'sub_department_id',
}


def resolve_emp_ids_by_scope(scope: str, scope_id: str) -> list:
    """Return employee user IDs for the given scope and scope_id."""
    if scope == 'employee':
        return [scope_id]
    if scope not in _SCOPE_FIELD_MAP:
        raise ValueError(f'Invalid scope: {scope}')
    users = (
        supabase.table('users')
        .select('id')
        .eq(_SCOPE_FIELD_MAP[scope], scope_id)
        .eq('role', 'employee')
        .execute()
    )
    return [u['id'] for u in users.data]


def get_period_dates(period_type: str, year: int) -> tuple:
    """Return (start_date, end_date) strings for the given period."""
    if period_type == 'mid_year':
        return f"{year}-01-01", f"{year}-06-30"
    return f"{year}-07-01", f"{year}-12-31"


def calculate_bell_curve_from_scores(records: list) -> list:
    """Group employee final scores into 0.5-wide rating buckets."""
    ranges = [
        ('1.0-1.5', 1.0, 1.5), ('1.5-2.0', 1.5, 2.0),
        ('2.0-2.5', 2.0, 2.5), ('2.5-3.0', 2.5, 3.0),
        ('3.0-3.5', 3.0, 3.5), ('3.5-4.0', 3.5, 4.0),
        ('4.0-4.5', 4.0, 4.5), ('4.5-5.0', 4.5, 5.0),
    ]
    total = len(records)
    result = []
    for label, low, high in ranges:
        if high == 5.0:
            count = sum(1 for r in records if r.get('total_score') is not None and low <= float(r['total_score']) <= high)
        else:
            count = sum(1 for r in records if r.get('total_score') is not None and low <= float(r['total_score']) < high)
        result.append({
            'rating_range': label,
            'employee_count': count,
            'percentage': round((count / total * 100), 2) if total > 0 else 0,
        })
    return result
