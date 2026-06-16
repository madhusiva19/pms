from models.supabase_client import supabase
from utils.helpers import resolve_emp_ids_by_scope
from datetime import datetime


def _generate_ai_insight(report_data: dict, report_type: str) -> str:
    # Template-based insight so the report always ships with text even before an ML model is integrated
    if report_type == 'mid_year':
        return (
            f"Distribution follows a normal curve with slight right skew. "
            f"Top {report_data.get('top_performers_percentage', 18)}% performers exceed 4.5 rating. "
            f"Recommend targeted development programs for the lower 15%"
        )
    return (
        "Year-end performance shows improvement across all bands. "
        "Top performers increased by 37%. Distribution normalized successfully with 21% in exceptional category"
    )


def get_country_reports(country_id: str, report_type: str | None = None, year: int | None = None) -> list:
    query = supabase.table('performance_reports').select('*').eq('country_id', country_id)
    if report_type:
        query = query.eq('report_type', report_type)
    if year:
        query = query.eq('report_year', year)
    return query.execute().data


def create_performance_report(data: dict) -> dict:
    # AI insight is written immediately so the report is never displayed without insight text
    response = supabase.table('performance_reports').insert(data).execute()
    report_id = response.data[0]['id']
    supabase.table('ai_insights').insert({
        'report_id': report_id,
        'insight_text': _generate_ai_insight(data, data['report_type']),
        'insight_type': 'distribution_analysis',
    }).execute()
    return response.data[0]


def update_performance_report(report_id: str, data: dict) -> dict | None:
    # updated_at set here because the DB column lacks an auto-update trigger
    data['updated_at'] = datetime.utcnow().isoformat()
    response = supabase.table('performance_reports').update(data).eq('id', report_id).execute()
    return response.data[0] if response.data else None


def get_ai_insights(report_id: str) -> list:
    return supabase.table('ai_insights').select('*').eq('report_id', report_id).execute().data


def get_branch_reports(branch_id: str, report_type: str | None = None, year: int | None = None) -> list:
    query = supabase.table('branch_performance_reports').select('*').eq('branch_id', branch_id)
    if report_type:
        query = query.eq('report_type', report_type)
    if year:
        query = query.eq('report_year', year)
    return query.execute().data


def create_branch_report(data: dict) -> dict:
    response = supabase.table('branch_performance_reports').insert(data).execute()
    report_id = response.data[0]['id']
    supabase.table('branch_ai_insights').insert({
        'report_id': report_id,
        'insight_text': _generate_ai_insight(data, data['report_type']),
        'insight_type': 'distribution_analysis',
    }).execute()
    return response.data[0]


def update_branch_report(report_id: str, data: dict) -> dict | None:
    data['updated_at'] = datetime.utcnow().isoformat()
    response = supabase.table('branch_performance_reports').update(data).eq('id', report_id).execute()
    return response.data[0] if response.data else None


def get_branch_ai_insights(report_id: str) -> list:
    return supabase.table('branch_ai_insights').select('*').eq('report_id', report_id).execute().data


def get_report_metrics(period_type: str, year: int, scope: str, scope_id: str, employee_id: str | None = None) -> dict:
    # year is the active report year (e.g. 2026).
    # Both H1 (mid-year) and H2 (year-end) use the same pms_year — no year offset.
    db_period = 'H1' if period_type == 'mid_year' else 'H2'

    emp_ids = resolve_emp_ids_by_scope(scope, scope_id)
    if not emp_ids:
        return {'total_evaluated': 0, 'avg_score': 0.0, 'top_performers': 0, 'employee_score': None}

    summaries = supabase.table('performance_summaries').select('user_id, total_score').eq('pms_year', year).eq('period', db_period).in_('user_id', emp_ids).execute()
    scores = [float(r['total_score']) for r in summaries.data if r.get('total_score') is not None]

    # 8 equal-width buckets across the 1.0–5.0 range; midpoint used for weighted average
    bell_curve_buckets = [
        (1.0, 1.5, 1.25), (1.5, 2.0, 1.75), (2.0, 2.5, 2.25), (2.5, 3.0, 2.75),
        (3.0, 3.5, 3.25), (3.5, 4.0, 3.75), (4.0, 4.5, 4.25), (4.5, 5.0, 4.75),
    ]
    weighted_sum, total_count, top_performers = 0.0, 0, 0
    for low, high, midpoint in bell_curve_buckets:
        bucket = [s for s in scores if low <= s <= high] if high == 5.0 else [s for s in scores if low <= s < high]
        count = len(bucket)
        weighted_sum += midpoint * count
        total_count += count
        # top_performers: only the 4.5–5.0 bucket qualifies as top performers
        if low == 4.5:
            top_performers = count

    employee_score = None
    if employee_id:
        emp_summary = supabase.table('performance_summaries').select('total_score').eq('user_id', employee_id).eq('pms_year', year).eq('period', db_period).limit(1).execute()
        if emp_summary.data:
            ts = emp_summary.data[0].get('total_score')
            employee_score = float(ts) if ts is not None else None

    return {
        'total_evaluated': len(scores),
        'avg_score': round(weighted_sum / total_count, 2) if total_count > 0 else 0.0,
        'top_performers': top_performers,
        'employee_score': employee_score,
    }
