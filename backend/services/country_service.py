from lib.supabase_client import supabase


def get_all_countries() -> list:
    response = supabase.table('countries').select('*').execute()
    return response.data


def get_country_by_id(country_id: str) -> dict | None:
    response = supabase.table('countries').select('*').eq('id', country_id).single().execute()
    return response.data


def create_country(data: dict) -> dict:
    response = supabase.table('countries').insert(data).execute()
    return response.data[0]


def get_dashboard_summary(country_id: str) -> dict:
    country = supabase.table('countries').select('*').eq('id', country_id).single().execute()
    mid_year = supabase.table('performance_reports').select('*').eq('country_id', country_id).eq('report_type', 'mid_year').order('report_year', desc=True).limit(1).execute()
    year_end = supabase.table('performance_reports').select('*').eq('country_id', country_id).eq('report_type', 'year_end').order('report_year', desc=True).limit(1).execute()
    return {
        'country': country.data,
        'mid_year': mid_year.data[0] if mid_year.data else None,
        'year_end': year_end.data[0] if year_end.data else None,
    }
