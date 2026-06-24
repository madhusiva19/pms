"""Evaluation status tracking business logic."""

from datetime import datetime, timedelta

from flask import current_app, jsonify, request

from .common import *


_ROLE_TO_STAGE = {
    'employee':       'Sub Dept Admin Evaluation',
    'sub_dept_admin': 'Dept Admin Approval',
    'dept_admin':     'Branch Admin Review',
    'branch_admin':   'Country Admin Final Approval',
    'country_admin':  'HQ Admin Finalization',
}


def _apply_approval_stage_status(stages, employee_id):
    """Mutate stages in-place so the pending-approval stage reflects reality.

    If an approval record exists for this employee:
      - pending approval  → the role's corresponding stage becomes 'in progress'
      - approved approval → the role's corresponding stage becomes 'completed'
    Only overrides a stage that is currently 'pending'.
    """
    try:
        approval = fetch_first("approvals", "team_member_id", employee_id, missing_ok=True)
        if not approval:
            approval = fetch_first("approvals", "employee_id", employee_id, missing_ok=True)
        if not approval:
            return
        member = fetch_first("team_members", "id", employee_id, missing_ok=True)
        member_role = (member or {}).get("role") or (member or {}).get("designation")
        target_stage = _ROLE_TO_STAGE.get(member_role or "")
        if not target_stage:
            return
        approval_status = normalize_status_value(approval.get("status", ""))
        new_status = "completed" if approval_status == "approved" else "in progress"
        for stage in stages:
            if stage.get("name") == target_stage and normalize_status_value(stage.get("status", "")) == "pending":
                stage["status"] = new_status
                break
    except Exception:
        pass


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
                default_stages = [
                    {"name": "Self Evaluation", "status": "completed"},
                    {"name": "Sub Dept Admin Evaluation", "status": "in progress"},
                    {"name": "Dept Admin Approval", "status": "pending"},
                    {"name": "Branch Admin Review", "status": "pending"},
                    {"name": "Country Admin Final Approval", "status": "pending"},
                    {"name": "HQ Admin Finalization", "status": "pending"},
                ]
                _apply_approval_stage_status(default_stages, employee_id)
                return jsonify(
                    {
                        "id": employee_id,
                        "employee": member["name"] if member else f"Employee {employee_id}",
                        "stages": default_stages,
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
            # Override the pending upper-level stage based on the approval record.
            _apply_approval_stage_status(normalized["stages"], employee_id)
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
                {"name": "HQ Admin Finalization", "status": "pending"},
            ],
            "rejectionComments": None,
        }), 200
    return fallback_response(status)
