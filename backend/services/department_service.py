from lib.supabase_client import supabase


def get_departments_by_branch(branch_id: str) -> list:
    return supabase.table('departments').select('*').eq('branch_id', branch_id).order('name').execute().data


def get_department_by_id(dept_id: str) -> dict | None:
    return supabase.table('departments').select('*').eq('id', dept_id).single().execute().data


def get_sub_departments_by_dept(dept_id: str) -> list:
    return supabase.table('sub_departments').select('*').eq('department_id', dept_id).order('name').execute().data


def get_sub_department_by_id(sub_dept_id: str) -> dict | None:
    return supabase.table('sub_departments').select('*').eq('id', sub_dept_id).single().execute().data
