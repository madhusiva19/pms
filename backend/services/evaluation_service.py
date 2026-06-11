"""Evaluation submission, lookup, and rejection business logic."""

from datetime import datetime, timedelta

from flask import current_app, jsonify, request

from .evaluation_common import *

from .evaluation_notification_service import create_notification


def get_evaluations():
    """Return all saved evaluations."""

    if USE_SUPABASE:
        rows = fetch_rows("evaluations", params={"select": "*", "order": "id.asc"})
        return jsonify([build_evaluation_payload(row) for row in rows]), 200
    return fallback_response([])


def submit_memory_evaluation(data, member_id):
    """Submit an evaluation into the in-memory fallback store."""

    # This path keeps local demos working when the Supabase write path is down.
    member = next((m for m in team_members if str(m["id"]) == str(member_id)), None)
    if not member:
        return None

    member["status"] = "completed"
    approval = {
        "id": len(approvals) + 1,
        "employee": member["name"],
        "employee_id": member["id"],
        "team_member_id": member["id"],
        "evaluationBy": data.get("evaluationBy") or DEFAULT_EVALUATOR_NAME,
        "level": data.get("level") or DEFAULT_APPROVAL_LEVEL,
        "status": "pending",
        "dueDate": (datetime.utcnow() + timedelta(days=14)).date().isoformat(),
    }
    approvals.append(approval)
    create_notification(
        "approval_required",
        "Approval Required",
        f"{member['name']} evaluation is ready for approval.",
    )
    return {"message": "Evaluation submitted", "evaluation": None, "approval": approval}


def create_evaluation():
    """Submit an evaluation and create the related approval request."""

    data = request.get_json(silent=True) or {}
    member_id = data.get("employee_id") or data.get("member_id")

    if not member_id:
        return jsonify({"error": "employee_id is required"}), 400

    if USE_SUPABASE:
        try:
            member = fetch_first("team_members", "id", member_id, missing_ok=True)
            if not member:
                # If the DB does not have the member but the in-memory store does,
                # still complete the workflow for the current backend session.
                memory_result = submit_memory_evaluation(data, member_id)
                if memory_result:
                    return fallback_response(memory_result, 201)
                return jsonify({"error": "Team member not found"}), 404

            evaluation = create_evaluation_record(data, member)
            approval = create_approval_record(data, member, evaluation)

            try:
                # After submission the member leaves the evaluator's active queue.
                supabase_request(
                    "team_members",
                    method="PATCH",
                    params={"id": f"eq.{member_id}"},
                    payload={"status": "completed", "updated_at": datetime.utcnow().isoformat()},
                )
            except Exception as error:
                current_app.logger.info("Could not update team member status after submit: %s", error)

            create_notification(
                "approval_required",
                "Approval Required",
                f"{normalize_member(member).get('name', 'Employee')} evaluation is ready for approval.",
                evaluation.get("id") if evaluation else None,
            )

            return jsonify(
                {
                    "message": "Evaluation submitted",
                    "evaluation": build_evaluation_payload(evaluation) if evaluation else None,
                    "approval": approval,
                }
            ), 201
        except Exception as error:
            memory_result = submit_memory_evaluation(data, member_id)
            if memory_result:
                current_app.logger.warning("Submitted evaluation using in-memory fallback after database error: %s", error)
                return fallback_response(memory_result, 201)
            current_app.logger.exception("Could not submit evaluation")
            return jsonify({"error": str(error)}), 500

    memory_result = submit_memory_evaluation(data, member_id)
    if not memory_result:
        return jsonify({"error": "Team member not found"}), 404
    return fallback_response(memory_result, 201)


def get_evaluation(evaluation_id):
    """Return one saved evaluation by ID."""

    if USE_SUPABASE:
        evaluation = fetch_first("evaluations", "id", evaluation_id, missing_ok=True)
        if not evaluation:
            return jsonify({"error": "Evaluation not found"}), 404
        return jsonify(build_evaluation_payload(evaluation)), 200
    return fallback_response({})


def reject_evaluation(eval_id):
    """Reject an evaluation and store the rejection comments."""

    data = request.get_json(silent=True) or {}

    if USE_SUPABASE:
        try:
            rows = []
            status = fetch_first("evaluation_status", "member_id", eval_id, missing_ok=True) or fetch_first("evaluation_status", "employee_id", eval_id, missing_ok=True)
            if status:
                # Rejection comments are stored on the active workflow status row
                # so Status Tracking can show why work was sent back.
                key = "member_id" if "member_id" in status else "employee_id"
                rows = supabase_request(
                    "evaluation_status",
                    method="PATCH",
                    params={key: f"eq.{eval_id}"},
                    payload={"rejection_comments": data.get("comments", ""), "updated_at": datetime.utcnow().isoformat()},
                )
            evaluation = fetch_first("evaluations", "id", eval_id, missing_ok=True)
            approval = fetch_first("approvals", "evaluation_id", eval_id, missing_ok=True)
            if evaluation and approval:
                # Keep a separate rejection-comments audit row when the schema
                # includes the dedicated table.
                fetch_rows(
                    "rejection_comments",
                    params={"select": "id", "limit": 1},
                    missing_ok=True,
                )
                supabase_request(
                    "rejection_comments",
                    method="POST",
                    payload={
                        "evaluation_id": evaluation["id"],
                        "approval_id": approval["id"],
                        "comments": data.get("comments", ""),
                        "resubmitted_by": data.get("resubmitted_by"),
                        "rejection_date": datetime.utcnow().date().isoformat(),
                    },
                )
            create_notification(
                "rejection",
                "Evaluation Rejected",
                f"Evaluation {eval_id} was rejected and sent back for resubmission.",
                eval_id,
            )
            return jsonify({"message": "Evaluation rejected", "data": normalize_status(rows[0]) if rows else {}}), 200
        except Exception as error:
            current_app.logger.warning("Falling back to in-memory rejection update: %s", error)

    status = next((s for s in evaluation_status if s["id"] == eval_id), None)
    if not status:
        return jsonify({"error": "Evaluation not found"}), 404
    status["rejectionComments"] = data.get("comments", "")
    create_notification(
        "rejection",
        "Evaluation Rejected",
        f"{status.get('employee', 'An evaluation')} was rejected and sent back for resubmission.",
        eval_id,
    )
    return fallback_response({"message": "Evaluation rejected", "data": status})
# These routes provide objective rows and summary counts used by evaluation,
# approval, member directory, and dashboard-style pages.
