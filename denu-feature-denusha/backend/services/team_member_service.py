"""Team member business logic."""

from datetime import datetime, timedelta

from flask import current_app, jsonify, request

from .common import *

from .notification_service import create_notification


def get_team_members():
    """Return all team members for My Team and Members pages."""

    if USE_SUPABASE:
        try:
            rows = supabase_request("team_members", params={"select": "*", "order": "id.asc", "limit": 100})
            return jsonify([normalize_member(row) for row in rows]), 200
        except Exception as error:
            current_app.logger.warning("Falling back to in-memory team members: %s", error)

    return fallback_response(team_members)


def get_team_member(member_id):
    """Return one team member and attach the latest evaluation when available."""

    if USE_SUPABASE:
        try:
            member = fetch_first("team_members", "id", member_id)
            if not member:
                return jsonify({"error": "Team member not found"}), 404

            normalized = normalize_member(member)
            try:
                # Attach the latest evaluation when present so detail pages have
                # one complete member payload.
                evaluations = supabase_request("evaluations", params={"select": "*", "employee_id": f"eq.{member_id}", "limit": 1, "order": "id.desc"})
                if evaluations:
                    normalized["evaluation"] = build_evaluation_payload(evaluations[0])
            except Exception as error:
                current_app.logger.info("No evaluations table/data for member %s: %s", member_id, error)

            return jsonify(normalized), 200
        except Exception as error:
            current_app.logger.warning("Falling back to in-memory team member: %s", error)

    member = next((m for m in team_members if m["id"] == member_id), None)
    if not member:
        return jsonify({"error": "Team member not found"}), 404
    return fallback_response(member)


def update_member_status(member_id):
    """Update a team member status after saving drafts or completing work."""

    data = request.get_json(silent=True) or {}
    status_value = normalize_status_value(clean_text(data.get("status")))
    if status_value not in VALID_MEMBER_STATUSES:
        return error_response(
            "Status must be one of: pending, in progress, completed",
            400,
        )

    updated_member = None

    if USE_SUPABASE:
        try:
            rows = supabase_request(
                "team_members",
                method="PATCH",
                params={"id": f"eq.{member_id}"},
                payload={"status": status_value, "updated_at": datetime.utcnow().isoformat()},
            )
            if not rows:
                return jsonify({"error": "Team member not found"}), 404
            updated_member = normalize_member(rows[0])
            create_notification(
                "status_update",
                "Team Member Status Updated",
                f"{updated_member.get('name', 'Team member')} status changed to {normalize_status_value(status_value)}.",
            )
            return jsonify(updated_member), 200
        except Exception as error:
            current_app.logger.warning("Falling back to in-memory status update: %s", error)

    member = next((m for m in team_members if m["id"] == member_id), None)
    if not member:
        return jsonify({"error": "Team member not found"}), 404
    member["status"] = status_value or member["status"]
    create_notification(
        "status_update",
        "Team Member Status Updated",
        f"{member.get('name', 'Team member')} status changed to {normalize_status_value(member['status'])}.",
    )
    return fallback_response(member)
# employee names, evaluator names, approval levels, and status changes.
