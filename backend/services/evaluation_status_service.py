"""Evaluation status tracking business logic."""

from datetime import datetime, timedelta

from flask import current_app, jsonify, request

from .common import *


def get_evaluation_status(employee_id):
    """Return workflow stages for one employee evaluation."""

    if USE_SUPABASE:
        try:
            status = fetch_first("evaluation_status", "member_id", employee_id, missing_ok=True)
            if not status:
                status = fetch_first("evaluation_status", "employee_id", employee_id, missing_ok=True)
            if not status:
                # When no persisted workflow exists, return a default timeline
                # so the status page remains useful for newly loaded members.
                member = fetch_first("team_members", "id", employee_id, missing_ok=True)
                return jsonify(
                    {
                        "id": employee_id,
                        "employee": member["name"] if member else f"Employee {employee_id}",
                        "stages": [
                            {"name": "Self Evaluation", "status": "completed"},
                            {"name": "Sub Dept Admin Evaluation", "status": "in progress"},
                            {"name": "Dept Admin Approval", "status": "pending"},
                            {"name": "Branch Admin Review", "status": "pending"},
                            {"name": "Country Admin Final Approval", "status": "pending"},
                        ],
                        "rejectionComments": None,
                    }
                ), 200

            normalized = normalize_status(status)
            member = fetch_first("team_members", "id", employee_id, missing_ok=True)
            normalized["employee"] = member["name"] if member else f"Employee {employee_id}"
            if not normalized.get("stages"):
                # Some schemas store timeline stages in a child table instead
                # of embedding them on the status row.
                stages = fetch_rows("evaluation_stages", params={"select": "*", "evaluation_status_id": f"eq.{status.get('id')}", "order": "id.asc"})
                normalized["stages"] = [
                    {
                        "name": stage.get("stage_name") or stage.get("name"),
                        "status": normalize_status_value(stage.get("stage_status") or stage.get("status")),
                        "date": stage.get("stage_date") or stage.get("date"),
                        "user": stage.get("assigned_user") or stage.get("user"),
                    }
                    for stage in stages
                ]
            normalized.setdefault("stages", [])
            return jsonify(normalized), 200
        except Exception as error:
            current_app.logger.warning("Falling back to in-memory evaluation status: %s", error)

    status = next((s for s in evaluation_status if s["id"] == employee_id), None)
    if not status:
        return jsonify({
            "id": employee_id,
            "employee": f"Employee {employee_id}",
            "stages": [
                {"name": "Self Evaluation", "status": "completed"},
                {"name": "Sub Dept Admin Evaluation", "status": "in progress"},
                {"name": "Dept Admin Approval", "status": "pending"},
                {"name": "Branch Admin Review", "status": "pending"},
                {"name": "Country Admin Final Approval", "status": "pending"},
            ],
            "rejectionComments": None,
        }), 200
    return fallback_response(status)
