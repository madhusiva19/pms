import json
import os
import random

from models.supabase_client import supabase

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")

with open(os.path.join(_DATA_DIR, "iata_branch_coordinates.json")) as f:
    _IATA_COORDINATES = json.load(f)

with open(os.path.join(_DATA_DIR, "country_bounding_boxes.json")) as f:
    _COUNTRY_BOUNDING_BOXES = json.load(f)


def _resolve_branch_coordinates(branch_code, country_code):
    coords = _IATA_COORDINATES.get(branch_code)
    if coords:
        return coords["lat"], coords["lng"], True

    bbox = _COUNTRY_BOUNDING_BOXES.get(country_code)
    if bbox:
        min_lat, max_lat, min_lng, max_lng = bbox
        return random.uniform(min_lat, max_lat), random.uniform(min_lng, max_lng), False

    return 0.0, 0.0, False


def _build_department_tree(department_rows, sub_department_rows):
    sub_depts_by_department = {}
    for sd in sub_department_rows:
        sub_depts_by_department.setdefault(sd["department_id"], []).append({
            "sub_dept_id": sd["id"],
            "name": sd["name"],
        })

    departments_by_branch = {}
    for d in department_rows:
        departments_by_branch.setdefault(d["branch_id"], []).append({
            "dept_id": d["id"],
            "name": d["name"],
            "sub_departments": sub_depts_by_department.get(d["id"], []),
        })

    return departments_by_branch


def get_map_tree(country_id=None):
    try:
        countries_query = supabase.table("countries").select("id, name, code").order("name")
        if country_id:
            countries_query = countries_query.eq("id", country_id)
        countries = countries_query.execute().data or []

        if not countries:
            return {"countries": []}, 200

        country_ids = [c["id"] for c in countries]
        country_code_by_id = {c["id"]: c["code"] for c in countries}

        branches = supabase.table("branches")\
            .select("id, name, code, country_id")\
            .in_("country_id", country_ids)\
            .order("name")\
            .execute().data or []

        branch_ids = [b["id"] for b in branches]

        departments = []
        sub_departments = []
        if branch_ids:
            departments = supabase.table("departments")\
                .select("id, name, branch_id")\
                .in_("branch_id", branch_ids)\
                .order("name")\
                .execute().data or []

            department_ids = [d["id"] for d in departments]
            if department_ids:
                sub_departments = supabase.table("sub_departments")\
                    .select("id, name, department_id")\
                    .in_("department_id", department_ids)\
                    .order("name")\
                    .execute().data or []

        departments_by_branch = _build_department_tree(departments, sub_departments)

        branches_by_country = {}
        for b in branches:
            country_code = country_code_by_id.get(b["country_id"])
            lat, lng, geocoded = _resolve_branch_coordinates(b["code"], country_code)

            branches_by_country.setdefault(b["country_id"], []).append({
                "branch_id": b["id"],
                "name": b["name"],
                "lat": lat,
                "lng": lng,
                "geocoded": geocoded,
                "departments": departments_by_branch.get(b["id"], []),
            })

        result = {
            "countries": [
                {
                    "country_id": c["id"],
                    "country_name": c["name"],
                    "branches": branches_by_country.get(c["id"], []),
                }
                for c in countries
            ]
        }

        return result, 200
    except Exception as e:
        print(f"[ERROR] get_map_tree: {e}")
        return {"message": "Something went wrong. Please try again."}, 500
