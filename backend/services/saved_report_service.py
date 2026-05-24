from lib.supabase_client import supabase
from datetime import datetime


def list_saved_reports(user_id: str, report_type: str | None = None,
                       country_id: str | None = None, branch_id: str | None = None,
                       limit: int = 50, offset: int = 0) -> list:
    # desc=True + limit/offset: most recent first with server-side pagination to avoid loading all rows
    query = supabase.table('saved_reports').select('*').eq('user_id', user_id)
    if report_type:
        query = query.eq('report_type', report_type)
    if country_id:
        query = query.eq('country_id', country_id)
    if branch_id:
        query = query.eq('branch_id', branch_id)
    return query.order('created_at', desc=True).limit(limit).offset(offset).execute().data


def create_saved_report(data: dict) -> dict:
    # None values stripped so DB defaults are used instead of writing explicit nulls
    data = {k: v for k, v in data.items() if v is not None}
    # setdefault: sensible defaults for optional fields so callers only need to supply what differs
    data.setdefault('metrics_included', ['evaluated', 'avg_score', 'top_performers'])
    data.setdefault('charts_included', ['bell_curve'])
    data.setdefault('include_ai_insights', True)
    data.setdefault('include_comparison', False)
    data.setdefault('is_trend_report', False)
    data.setdefault('selected_periods', [])
    return supabase.table('saved_reports').insert(data).execute().data[0]


def get_saved_report_by_id(saved_report_id: str) -> dict | None:
    return supabase.table('saved_reports').select('*').eq('id', saved_report_id).single().execute().data


def update_saved_report(saved_report_id: str, data: dict) -> dict | None:
    # updated_at set here because the DB column lacks an auto-update trigger
    data['updated_at'] = datetime.utcnow().isoformat()
    response = supabase.table('saved_reports').update(data).eq('id', saved_report_id).execute()
    return response.data[0] if response.data else None


def delete_saved_report(saved_report_id: str) -> None:
    supabase.table('saved_reports').delete().eq('id', saved_report_id).execute()


def log_download(saved_report_id: str, user_id: str, file_format: str = 'pdf', user_email: str | None = None) -> dict:
    # Audit trail: records who downloaded which report and in what format for compliance tracking
    log_entry = {'saved_report_id': saved_report_id, 'user_id': user_id, 'file_format': file_format, 'user_email': user_email}
    return supabase.table('saved_report_downloads').insert(log_entry).execute().data[0]


def get_downloads(saved_report_id: str) -> list:
    return supabase.table('saved_report_downloads').select('*').eq('saved_report_id', saved_report_id).order('download_timestamp', desc=True).execute().data


def share_saved_report(saved_report_id: str, shared_with_emails: list) -> dict | None:
    data = {'is_shared': True, 'shared_with_emails': shared_with_emails, 'updated_at': datetime.utcnow().isoformat()}
    response = supabase.table('saved_reports').update(data).eq('id', saved_report_id).execute()
    return response.data[0] if response.data else None


def get_trend_analysis(saved_report_id: str) -> dict:
    report = supabase.table('saved_reports').select('*').eq('id', saved_report_id).single().execute().data
    if not report:
        raise ValueError('Saved report not found')
    if not report.get('is_trend_report'):
        raise ValueError('This is not a trend analysis report')

    selected_periods = report.get('selected_periods', [])
    if not selected_periods:
        raise ValueError('No periods selected for trend analysis')

    # trend_metrics cached on the row after first calculation to avoid recomputing on every request
    if report.get('trend_metrics'):
        return report['trend_metrics']

    periods_data = []
    for period_str in selected_periods:
        parts = period_str.split('_')
        year = int(parts[-1])
        report_type = '_'.join(parts[:-1])

        if report['report_type'] == 'country':
            pr = supabase.table('performance_reports').select('*').eq('country_id', report['country_id']).eq('report_year', year).eq('report_type', report_type).single().execute()
        else:
            pr = supabase.table('branch_performance_reports').select('*').eq('branch_id', report['branch_id']).eq('report_year', year).eq('report_type', report_type).single().execute()

        if pr.data:
            d = pr.data
            periods_data.append({
                'period': period_str, 'year': year, 'report_type': report_type,
                'metrics': {
                    'total_evaluated': d.get('total_evaluated', 0),
                    'avg_score': d.get('avg_score', 0),
                    'top_performers': d.get('top_performers', 0),
                    'completion_percentage': d.get('completion_percentage', 0),
                },
            })

    if not periods_data:
        raise ValueError('Could not fetch metrics for selected periods')

    changes = {}
    for metric in ['total_evaluated', 'avg_score', 'top_performers', 'completion_percentage']:
        if len(periods_data) > 1:
            first, last = periods_data[0]['metrics'][metric], periods_data[-1]['metrics'][metric]
            # Guard: avoid division by zero when first value is 0
            if first == 0 and last == 0:
                change_value, change_pct = 0, 0
            elif first == 0:
                change_value, change_pct = last, 100
            else:
                change_value = last - first
                change_pct = round((change_value / first) * 100, 2)
            direction = 'up' if change_value > 0 else ('down' if change_value < 0 else 'stable')
            changes[metric] = {
                'value': round(change_value, 2), 'percentage': change_pct, 'direction': direction,
                'label': f"{'+' if change_value >= 0 else ''}{change_value:.2f} ({'+' if change_pct >= 0 else ''}{change_pct}%)",
            }

    trends = {}
    for metric in ['avg_score', 'top_performers']:
        values = [p['metrics'][metric] for p in periods_data]
        if len(values) >= 2:
            improving = sum(1 for i in range(1, len(values)) if values[i] > values[i - 1])
            declining = sum(1 for i in range(1, len(values)) if values[i] < values[i - 1])
            trends[f'{metric}_trend'] = 'improving' if improving > declining else ('declining' if declining > improving else 'stable')

    eval_values = [p['metrics']['total_evaluated'] for p in periods_data]
    if len(eval_values) >= 2:
        growing  = sum(1 for i in range(1, len(eval_values)) if eval_values[i] > eval_values[i - 1])
        declining = sum(1 for i in range(1, len(eval_values)) if eval_values[i] < eval_values[i - 1])
        trends['evaluated_trend'] = 'growing' if growing > declining else ('declining' if declining > growing else 'stable')

    trend_analysis = {'periods': periods_data, 'changes': changes, 'trends': trends}

    try:
        supabase.table('saved_reports').update({'trend_metrics': trend_analysis, 'updated_at': datetime.utcnow().isoformat()}).eq('id', saved_report_id).execute()
    except Exception:
        pass

    return trend_analysis
