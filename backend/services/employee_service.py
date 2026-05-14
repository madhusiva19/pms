from lib.supabase_client import supabase


def get_employees_by_sub_dept(sub_dept_id: str) -> list:
    return supabase.table('users').select('*').eq('sub_department_id', sub_dept_id).eq('role', 'employee').order('full_name').execute().data


def get_employee_by_id(emp_id: str) -> dict | None:
    return supabase.table('users').select('*').eq('id', emp_id).single().execute().data


def get_performance_summaries(user_id: str, year: int) -> list:
    records = (
        supabase.table('performance_summaries')
        .select('user_id, total_score, period, year')
        .eq('user_id', user_id)
        .eq('year', year)
        .execute()
    )
    for record in records.data:
        if record.get('period') == 'H1':
            record['period'] = 'mid_year'
        elif record.get('period') == 'H2':
            record['period'] = 'year_end'
    return records.data
