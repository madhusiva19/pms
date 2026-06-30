import requests as req
from models import supabase, SUPABASE_URL, SUPABASE_KEY


def get_scores_map(entity_ids: list, entity_type: str) -> dict:
    """Fetch avg_score for many entities in a single query instead of one request per entity."""
    if not entity_ids:
        return {}
    res = supabase.table("performance_scores")\
        .select("entity_id, avg_score")\
        .eq("entity_type", entity_type)\
        .in_("entity_id", entity_ids)\
        .execute()
    return {row["entity_id"]: float(row["avg_score"]) for row in (res.data or [])}


def get_stats(employee_id):
    try:
        user = supabase.table("users")\
            .select("org_level, iata_branch_code, country_id, branch_id, department_id, sub_department_id")\
            .eq("id", employee_id)\
            .execute()

        if not user.data:
            return {"message": "User not found"}, 404

        u                  = user.data[0]
        org_level          = u["org_level"]
        country_id         = u.get("country_id")
        branch_id          = u.get("branch_id")
        dept_id            = u.get("department_id")
        sub_department_id  = u.get("sub_department_id")
        stats              = {}

        if org_level == 1:
            countries = supabase.table("countries").select("id", count="exact").execute()
            branches  = supabase.table("branches").select("id", count="exact").execute()
            employees = supabase.table("users").select("id", count="exact").eq("org_level", 6).execute()
            stats = {
                "Total Countries": countries.count or 0,
                "Total Branches":  branches.count  or 0,
                "Total Employees": employees.count or 0,
            }

        elif org_level == 2:
            country_data = supabase.table("countries").select("total_employees").eq("id", country_id).execute()
            branches = supabase.table("branches").select("id", count="exact").eq("country_id", country_id).execute()
            emp3     = supabase.table("users").select("id", count="exact").eq("org_level", 3).eq("country_id", country_id).execute()
            emp4     = supabase.table("users").select("id", count="exact").eq("org_level", 4).eq("country_id", country_id).execute()
            emp5     = supabase.table("users").select("id", count="exact").eq("org_level", 5).eq("country_id", country_id).execute()
            emp6     = supabase.table("users").select("id", count="exact").eq("org_level", 6).eq("country_id", country_id).execute()
            stats = {
                "Total Branches":    branches.count or 0,
                "Total Employees": country_data.data[0]["total_employees"] if country_data.data else 0,
                "Total Departments": emp4.count or 0,
            }

        elif org_level == 3:
            branch_data = supabase.table("branches").select("total_employees").eq("id", branch_id).execute()
            depts = supabase.table("departments").select("id", count="exact").eq("branch_id", branch_id).execute()
            emp4  = supabase.table("users").select("id", count="exact").eq("org_level", 4).eq("branch_id", branch_id).execute()
            emp5  = supabase.table("users").select("id", count="exact").eq("org_level", 5).eq("branch_id", branch_id).execute()
            emp6  = supabase.table("users").select("id", count="exact").eq("org_level", 6).eq("branch_id", branch_id).execute()
            stats = {
                "Total Departments": depts.count or 0,
                "Total Employees":   branch_data.data[0]["total_employees"] if branch_data.data else 0,
                "Total Sub-Depts":   emp5.count  or 0,
            }

        elif org_level == 4:
            department_data = supabase.table("departments").select("total_employees").eq("id", dept_id).execute()
            subdepts = supabase.table("sub_departments").select("id", count="exact").eq("department_id", dept_id).execute()
            emp6     = supabase.table("users").select("id", count="exact").eq("org_level", 6).eq("department_id", dept_id).execute()
            stats = {
                "Total Sub-Departments": subdepts.count or 0,
                "Total Employees":       department_data.data[0]["total_employees"] if department_data.data else 0,
            }

        elif org_level == 5:
            sub_department_data = supabase.table("sub_departments").select("total_employees").eq("id", sub_department_id).execute()
            employees = supabase.table("users")\
                .select("id", count="exact")\
                .eq("manager_id", employee_id)\
                .execute()
            stats = {
                "Total Employees": sub_department_data.data[0]["total_employees"] if sub_department_data.data else 0,
            }

        return {"stats": stats}, 200
    except Exception as e:
        print(f"[ERROR] get_stats: {e}")
        return {"message": "Something went wrong. Please try again."}, 500


def get_charts(employee_id):
    try:
        user = supabase.table("users")\
            .select("org_level, country_id, branch_id, department_id, sub_department_id")\
            .eq("id", employee_id)\
            .execute()

        if not user.data:
            return {"message": "User not found"}, 404

        u          = user.data[0]
        org_level  = u["org_level"]
        country_id = u.get("country_id")
        branch_id  = u.get("branch_id")
        dept_id    = u.get("department_id")

        bar = []
        pie = []

        if org_level == 1:
            countries = supabase.table("countries")\
                .select("id, name, total_employees")\
                .execute()
            score_map = get_scores_map([c["id"] for c in countries.data], "country")
            for i, c in enumerate(countries.data):
                bar.append({
                    "name":  c["name"],
                    "score": score_map.get(c["id"], 0.0),
    
                })
                pie.append({
                    "name":  c["name"],
                    "value": c.get("total_employees") or 0,
                    
                })

        elif org_level == 2:
            branches = supabase.table("branches")\
                .select("id, name, total_employees")\
                .eq("country_id", country_id)\
                .execute()

            if branches.data:
                score_map = get_scores_map([b["id"] for b in branches.data], "branch")
                for i, b in enumerate(branches.data):
                    bar.append({
                        "name":  b.get("name", "Unknown"),
                        "score": score_map.get(b["id"], 0.0),
                        
                    })
                    pie.append({
                        "name":  b.get("name", "Unknown"),
                        "value": b.get("total_employees") or 0,
                        
                    })
            else:
                # No branches (e.g. Sri Lanka) — fall back to departments
                depts = supabase.table("departments")\
                    .select("id, name, total_employees")\
                    .eq("country_id", country_id)\
                    .execute()
                score_map = get_scores_map([d["id"] for d in depts.data], "department")
                for i, d in enumerate(depts.data):
                    bar.append({
                        "name":  d["name"],
                        "score": score_map.get(d["id"], 0.0),
                        
                    })
                    pie.append({
                        "name":  d["name"],
                        "value": d.get("total_employees") or 0,
                        
                    })

        elif org_level == 3:
            depts = supabase.table("departments")\
                .select("id, name, total_employees")\
                .eq("branch_id", branch_id)\
                .execute()
            score_map = get_scores_map([d["id"] for d in depts.data], "department")
            for i, d in enumerate(depts.data):
                bar.append({
                    "name":  d["name"],
                    "score": score_map.get(d["id"], 0.0),
                    
                })
                pie.append({
                    "name":  d["name"],
                    "value": d.get("total_employees") or 0,
                    
                })

        elif org_level == 4:
            subdepts = supabase.table("sub_departments")\
                .select("id, name, total_employees")\
                .eq("department_id", dept_id)\
                .execute()
            score_map = get_scores_map([sd["id"] for sd in subdepts.data], "sub_department")
            for i, sd in enumerate(subdepts.data):
                bar.append({
                    "name":  sd["name"],
                    "score": score_map.get(sd["id"], 0.0),
                    
                })
                pie.append({
                    "name":  sd["name"],
                    "value": sd.get("total_employees") or 0,
                    
                })

        elif org_level == 5:
            employees = supabase.table("users")\
                .select("id, full_name")\
                .eq("manager_id", employee_id)\
                .execute()
            score_map = get_scores_map([e["id"] for e in employees.data], "employee")
            for i, e in enumerate(employees.data):
                parts = e["full_name"].split(" ")
                short = f"{parts[0][0]}. {parts[-1]}" if len(parts) > 1 else e["full_name"]
                bar.append({
                    "name":  short,
                    "score": score_map.get(e["id"], 0.0),
                    
                })

        return {"data": {"bar": bar, "pie": pie}}, 200
    except Exception as e:
        print(f"[ERROR] get_charts: {e}")
        return {"message": "Something went wrong. Please try again."}, 500