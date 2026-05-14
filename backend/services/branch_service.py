from lib.supabase_client import supabase


def get_branches_by_country(country_id: str, search: str | None = None) -> list:
    query = supabase.table('branches').select('*').eq('country_id', country_id)
    if search:
        query = query.ilike('name', f'%{search}%')
    return query.execute().data


def get_branch_by_id(branch_id: str) -> dict | None:
    response = supabase.table('branches').select('*').eq('id', branch_id).single().execute()
    return response.data


def get_branch_by_code(code: str) -> dict | None:
    response = supabase.table('branches').select('*').eq('code', code).limit(1).execute()
    return response.data[0] if response.data else None


def create_branch(data: dict) -> dict:
    response = supabase.table('branches').insert(data).execute()
    return response.data[0]


def get_branch_dashboard_summary(branch_id: str) -> dict:
    branch = supabase.table('branches').select('*').eq('id', branch_id).single().execute()
    mid_year = supabase.table('branch_performance_reports').select('*').eq('branch_id', branch_id).eq('report_type', 'mid_year').order('report_year', desc=True).limit(1).execute()
    year_end = supabase.table('branch_performance_reports').select('*').eq('branch_id', branch_id).eq('report_type', 'year_end').order('report_year', desc=True).limit(1).execute()
    return {
        'branch': branch.data,
        'mid_year': mid_year.data[0] if mid_year.data else None,
        'year_end': year_end.data[0] if year_end.data else None,
    }
