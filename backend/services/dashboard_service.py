import requests as req
from models import supabase, SUPABASE_URL, SUPABASE_KEY

COLORS = [
    "#2563EB", "#00C49F", "#FFBB28", "#FF8042", "#8884D8",
    "#4F39F6", "#E11D48", "#0891B2", "#65A30D", "#D97706",
]


def get_score(entity_id: str, entity_type: str) -> float:
    url      = f"{SUPABASE_URL}/rest/v1/performance_scores"
    headers  = {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json"
    }
    full_url = f"{url}?select=avg_score&entity_type=eq.{entity_type}&entity_id=eq.{entity_id}"
    res      = req.get(full_url, headers=headers)
    print(f"DEBUG url: {full_url}")
    print(f"DEBUG response: {res.text}")
    data = res.json()
    return float(data[0]["avg_score"]) if data else 0.0


def get_stats(employee_id):
    user = supabase.table("users")\
        .select("org_level, iata_branch_code, country_id, branch_id, department_id, sub_department_id")\
        .eq("id", employee_id)\
        .execute()

    if not user.data:
        return {"message": "User not found"}, 404

    u          = user.data[0]
    org_level  = u["org_level"]
    country_id = u.get("country_id")
    branch_id  = u.get("branch_id")
    dept_id    = u.get("department_id")
    stats      = {}

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
        branches = supabase.table("branches").select("id", count="exact").eq("country_id", country_id).execute()
        emp3     = supabase.table("users").select("id", count="exact").eq("org_level", 3).eq("country_id", country_id).execute()
        emp4     = supabase.table("users").select("id", count="exact").eq("org_level", 4).eq("country_id", country_id).execute()
        emp5     = supabase.table("users").select("id", count="exact").eq("org_level", 5).eq("country_id", country_id).execute()
        emp6     = supabase.table("users").select("id", count="exact").eq("org_level", 6).eq("country_id", country_id).execute()
        stats = {
            "Total Branches":    branches.count or 0,
            "Total Employees":   (emp3.count or 0) + (emp4.count or 0) + (emp5.count or 0) + (emp6.count or 0),
            "Total Departments": emp4.count or 0,
        }

    elif org_level == 3:
        depts = supabase.table("departments").select("id", count="exact").eq("branch_id", branch_id).execute()
        emp4  = supabase.table("users").select("id", count="exact").eq("org_level", 4).eq("branch_id", branch_id).execute()
        emp5  = supabase.table("users").select("id", count="exact").eq("org_level", 5).eq("branch_id", branch_id).execute()
        emp6  = supabase.table("users").select("id", count="exact").eq("org_level", 6).eq("branch_id", branch_id).execute()
        stats = {
            "Total Departments": depts.count or 0,
            "Total Employees":   (emp4.count or 0) + (emp5.count or 0) + (emp6.count or 0),
            "Total Sub-Depts":   emp5.count  or 0,
        }

    elif org_level == 4:
        subdepts = supabase.table("sub_departments").select("id", count="exact").eq("department_id", dept_id).execute()
        emp6     = supabase.table("users").select("id", count="exact").eq("org_level", 6).eq("department_id", dept_id).execute()
        stats = {
            "Total Sub-Departments": subdepts.count or 0,
            "Total Employees":       emp6.count     or 0,
        }

    elif org_level == 5:
        employees = supabase.table("users")\
            .select("id", count="exact")\
            .eq("manager_id", employee_id)\
            .execute()
        stats = {
            "Total Employees": employees.count or 0,
        }

    return {"stats": stats}, 200


def get_charts(employee_id):
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
        for i, c in enumerate(countries.data):
            bar.append({
                "name":  c["name"],
                "score": get_score(c["id"], "country"),
                "fill":  COLORS[i % len(COLORS)]
            })
            pie.append({
                "name":  c["name"],
                "value": c.get("total_employees") or 0,
                "color": COLORS[i % len(COLORS)]
            })

    elif org_level == 2:
        branches = supabase.table("branches")\
            .select("id, name, total_employees")\
            .eq("country_id", country_id)\
            .execute()

        if branches.data:
            for i, b in enumerate(branches.data):
                bar.append({
                    "name":  b.get("name", "Unknown"),
                    "score": get_score(b["id"], "branch"),
                    "fill":  COLORS[i % len(COLORS)]
                })
                pie.append({
                    "name":  b.get("name", "Unknown"),
                    "value": b.get("total_employees") or 0,
                    "color": COLORS[i % len(COLORS)]
                })
        else:
            # No branches (e.g. Sri Lanka) — fall back to departments
            depts = supabase.table("departments")\
                .select("id, name, total_employees")\
                .eq("country_id", country_id)\
                .execute()
            for i, d in enumerate(depts.data):
                bar.append({
                    "name":  d["name"],
                    "score": get_score(d["id"], "department"),
                    "fill":  COLORS[i % len(COLORS)]
                })
                pie.append({
                    "name":  d["name"],
                    "value": d.get("total_employees") or 0,
                    "color": COLORS[i % len(COLORS)]
                })

    elif org_level == 3:
        depts = supabase.table("departments")\
            .select("id, name, total_employees")\
            .eq("branch_id", branch_id)\
            .execute()
        for i, d in enumerate(depts.data):
            bar.append({
                "name":  d["name"],
                "score": get_score(d["id"], "department"),
                "fill":  COLORS[i % len(COLORS)]
            })
            pie.append({
                "name":  d["name"],
                "value": d.get("total_employees") or 0,
                "color": COLORS[i % len(COLORS)]
            })

    elif org_level == 4:
        subdepts = supabase.table("sub_departments")\
            .select("id, name, total_employees")\
            .eq("department_id", dept_id)\
            .execute()
        for i, sd in enumerate(subdepts.data):
            bar.append({
                "name":  sd["name"],
                "score": get_score(sd["id"], "sub_department"),
                "fill":  COLORS[i % len(COLORS)]
            })
            pie.append({
                "name":  sd["name"],
                "value": sd.get("total_employees") or 0,
                "color": COLORS[i % len(COLORS)]
            })

    elif org_level == 5:
        employees = supabase.table("users")\
            .select("id, full_name")\
            .eq("manager_id", employee_id)\
            .execute()
        for i, e in enumerate(employees.data):
            parts = e["full_name"].split(" ")
            short = f"{parts[0][0]}. {parts[-1]}" if len(parts) > 1 else e["full_name"]
            bar.append({
                "name":  short,
                "score": get_score(e["id"], "employee"),
                "fill":  COLORS[i % len(COLORS)]
            })

    return {"data": {"bar": bar, "pie": pie}}, 200
