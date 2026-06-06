from lib.supabase_client import supabase


def get_employees_by_sub_dept(sub_dept_id: str) -> list:
    # role='employee' filter excludes admin users who share the same sub_department_id
    return supabase.table('users').select('*').eq('sub_department_id', sub_dept_id).eq('role', 'employee').order('full_name').execute().data


def get_employee_by_id(emp_id: str) -> dict | None:
    # .single() raises an error if the ID is missing, making bad lookups explicit
    return supabase.table('users').select('*').eq('id', emp_id).single().execute().data


def get_performance_summaries(user_id: str, report_year: int) -> list:
    # report_year is the display year (e.g. 2026).
    # Mid-year H1 lives in report_year-1; year-end H2 lives in report_year.
    h1 = (
        supabase.table('performance_summaries')
        .select('user_id, total_score, period, year')
        .eq('user_id', user_id)
        .eq('year', report_year - 1)
        .eq('period', 'H1')
        .execute()
    )
    h2 = (
        supabase.table('performance_summaries')
        .select('user_id, total_score, period, year')
        .eq('user_id', user_id)
        .eq('year', report_year)
        .eq('period', 'H2')
        .execute()
    )
    records = h1.data + h2.data
    for record in records:
        # H1/H2 are DB codes; renamed to mid_year/year_end to match frontend chart field names
        if record.get('period') == 'H1':
            record['period'] = 'mid_year'
        elif record.get('period') == 'H2':
            record['period'] = 'year_end'
    return records
