"""Approval workflow business logic."""

from datetime import datetime, timedelta

from flask import current_app, jsonify, request

from .evaluation_common import *

from .evaluation_notification_service import create_notification


def get_approvals():
    """Return approval rows for the approvals table."""

    if USE_SUPABASE:
        try:
            rows = supabase_request("approvals", params={"select": "*", "order": "id.asc", "limit": 100})
            member_names = {}
            user_names = {}
            normalized_rows = []
            for row in rows:
                approval = normalize_approval(row)
                # Approval rows may store only IDs. Resolve names here so the
                # frontend can render a readable table without extra requests.
                if not approval.get("employee") and approval.get("employee_id"):
                    if not member_names:
                        member_names = build_id_name_map("team_members", normalize_member)
                    if not user_names:
                        user_names = build_id_name_map("users", lambda user: user)
                    approval["employee"] = (
                        member_names.get(str(approval["employee_id"]))
                        or user_names.get(str(approval["employee_id"]))
                        or "Unknown Employee"
                    )
                if not approval.get("employee_id") and approval.get("employee"):
                    member = get_member_by_name(approval["employee"])
                    if member:
                        approval["employee_id"] = member["id"]
                        approval["team_member_id"] = member["id"]
                elif approval.get("employee"):
                    member = get_member_by_name(approval["employee"])
                    if member:
                        approval["team_member_id"] = member["id"]
                if not approval.get("evaluationBy") and approval.get("approved_by"):
                    # approved_by references a user row in the newer schema.
                    if not user_names:
                        user_names = build_id_name_map("users", lambda user: user)
                    approval["evaluationBy"] = user_names.get(str(approval["approved_by"])) or "Approver"
                approval.setdefault("evaluationBy", "Admin User")
                approval.setdefault("level", approval.get("approval_level", DEFAULT_APPROVAL_LEVEL))
                normalized_rows.append(approval)
            return jsonify(normalized_rows), 200
        except Exception as error:
            current_app.logger.warning("Falling back to in-memory approvals: %s", error)

    return fallback_response(approvals)


def get_approval(approval_id):
    """Return one approval row for the review page."""

    if USE_SUPABASE:
        try:
            approval = fetch_first("approvals", "id", approval_id)
            if not approval:
                return jsonify({"error": "Approval not found"}), 404
            normalized = normalize_approval(approval)
            # The review screen needs both display labels and member IDs to
            # fetch performance records, so fill whichever side is missing.
            if not normalized.get("employee") and normalized.get("employee_id"):
                normalized["employee"] = (
                    get_member_name(normalized["employee_id"])
                    or get_user_name(normalized["employee_id"])
                    or "Unknown Employee"
                )
            if not normalized.get("employee_id") and normalized.get("employee"):
                member = get_member_by_name(normalized["employee"])
                if member:
                    normalized["employee_id"] = member["id"]
                    normalized["team_member_id"] = member["id"]
            elif normalized.get("employee"):
                member = get_member_by_name(normalized["employee"])
                if member:
                    normalized["team_member_id"] = member["id"]
            normalized.setdefault("evaluationBy", get_user_name(normalized.get("approved_by")) or "Admin User")
            normalized.setdefault("level", normalized.get("approval_level", DEFAULT_APPROVAL_LEVEL))
            return jsonify(normalized), 200
        except Exception as error:
            current_app.logger.warning("Falling back to in-memory approval: %s", error)

    approval = next((a for a in approvals if a["id"] == approval_id), None)
    if not approval:
        return jsonify({"error": "Approval not found"}), 404
    return fallback_response(approval)


def update_approval(approval_id):
    """Approve or reject an approval and create a workflow notification."""

    data = request.get_json(silent=True) or {}
    status_value = data.get("status")

    # Map approval status changes to notification categories used by the UI.
    notification_type = "approval_required"
    if normalize_status_value(status_value) == "approved":
        notification_type = "approval_approved"
    elif normalize_status_value(status_value) == "rejected":
        notification_type = "rejection"

    if USE_SUPABASE:
        try:
            rows = supabase_request(
                "approvals",
                method="PATCH",
                params={"id": f"eq.{approval_id}"},
                payload={"status": status_value, "updated_at": datetime.utcnow().isoformat()},
            )
            if not rows:
                return jsonify({"error": "Approval not found"}), 404
            approval = normalize_approval(rows[0])
            create_notification(
                notification_type,
                "Approval Status Updated",
                f"{approval.get('employee', 'Employee')} approval status changed to {normalize_status_value(status_value)}.",
            )
            return jsonify(approval), 200
        except Exception as error:
            current_app.logger.warning("Falling back to in-memory approval update: %s", error)

    approval = next((a for a in approvals if a["id"] == approval_id), None)
    if not approval:
        return jsonify({"error": "Approval not found"}), 404
    approval["status"] = status_value or approval["status"]
    create_notification(
        notification_type,
        "Approval Status Updated",
        f"{approval.get('employee', 'Employee')} approval status changed to {normalize_status_value(approval['status'])}.",
    )
    return fallback_response(approval)
