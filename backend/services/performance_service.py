"""Performance record and summary business logic."""

from datetime import datetime, timedelta

from flask import current_app, jsonify, request

from .common import *


def get_performance_records():
    """Return performance/objective records, optionally filtered by employee."""

    if USE_SUPABASE:
        params = {"select": "*", "order": "id.asc", "limit": 100}
        member_id = request.args.get("member_id") or request.args.get("employee_id")
        user_id = request.args.get("user_id")
        if member_id:
            params["member_id"] = f"eq.{member_id}"
        if user_id:
            params["user_id"] = f"eq.{user_id}"

        rows = fetch_rows("performance_records", params=params)
        if not rows and member_id:
            # Some datasets use employee_id instead of member_id for the same
            # concept. Retry with the alternate column before returning empty.
            params.pop("member_id", None)
            params["employee_id"] = f"eq.{member_id}"
            rows = fetch_rows("performance_records", params=params)
        return jsonify(rows), 200
    return fallback_response([])


def get_performance_summary():
    """Return aggregate team performance summary values."""

    if USE_SUPABASE:
        rows = fetch_rows("performance_summary", params={"select": "*", "order": "id.asc", "limit": 100})
        if rows:
            return jsonify(rows), 200

        members = fetch_rows("team_members", params={"select": "status,overall_score"})
        summary = {
            # Build a summary from team member rows when the database does not
            # have a dedicated performance summary table.
            "totalMembers": len(members),
            "pending": sum(1 for member in members if normalize_status_value(member.get("status")) == "pending"),
            "inProgress": sum(1 for member in members if normalize_status_value(member.get("status")) == "in progress"),
            "completed": sum(1 for member in members if normalize_status_value(member.get("status")) == "completed"),
            "averageScore": round(
                sum(float(member.get("overall_score") or 0) for member in members if member.get("overall_score") is not None)
                / max(1, sum(1 for member in members if member.get("overall_score") is not None)),
                2,
            ),
        }
        return jsonify(summary), 200
    return fallback_response({})
