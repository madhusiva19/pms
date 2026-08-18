"""Team member business logic."""

from datetime import datetime, timedelta

from flask import current_app, jsonify, request

from .common import *

from .notification_service import create_notification


# Supabase/PostgREST in.(...) filters are one query string — batch id lookups so a
# large "all team members" request can't build a URL long enough to get truncated
# or rejected by a gateway (org has 1000+ users).
_USER_LOOKUP_CHUNK_SIZE = 100


def _fetch_users_by_id(user_ids):
    """Fetch id/full_name/email/role for a set of user ids, in chunks."""
    unique_ids = list(dict.fromkeys(uid for uid in user_ids if uid))
    if not unique_ids:
        return {}

    users_by_id = {}
    for i in range(0, len(unique_ids), _USER_LOOKUP_CHUNK_SIZE):
        chunk = unique_ids[i:i + _USER_LOOKUP_CHUNK_SIZE]
        user_rows = supabase_request("users", params={
            "select": "id,full_name,email,role",
            "id": f"in.({','.join(chunk)})",
        })
        users_by_id.update({u["id"]: u for u in user_rows})
    return users_by_id


def _get_user_identity(user_id):
    """Fetch full_name/email/role for a single user id."""
    return _fetch_users_by_id([user_id]).get(user_id)


def _apply_user_identity(row, user):
    """Overwrite a team_member row's identity fields with the linked user's live values.

    team_members stores its own copies of full_name/name/email/role from an old seed,
    which can drift from the person team_members.user_id actually points to. Both
    "full_name" and "name" are set since it's not certain which key the raw row uses.
    department, status, overall_score, performance_score, designation, and phone are
    left untouched — team_members stays the source of truth for those.
    """
    if not user:
        return row
    row["full_name"] = user["full_name"]
    row["name"] = user["full_name"]
    row["email"] = user["email"]
    row["role"] = user["role"]
    return row


def _with_user_identity(rows):
    """Apply _apply_user_identity across a list of team_member rows in one batch lookup."""
    users_by_id = _fetch_users_by_id([row.get("user_id") for row in rows])
    for row in rows:
        _apply_user_identity(row, users_by_id.get(row.get("user_id")))
    return rows


def get_team_members():
    """Return team members. Pass ?manager_id=<uuid> to scope to direct reports only."""
    manager_id = request.args.get("manager_id")

    if USE_SUPABASE:
        try:
            if manager_id:
                # Look up user IDs of everyone whose manager is the logged-in admin.
                user_rows = supabase_request("users", params={
                    "select": "id",
                    "manager_id": f"eq.{manager_id}",
                })
                user_ids = [u["id"] for u in user_rows]
                if not user_ids:
                    return jsonify([]), 200
                rows = supabase_request("team_members", params={
                    "select": "*",
                    "user_id": f"in.({','.join(user_ids)})",
                    "order": "id.asc",
                })
            else:
                rows = supabase_request("team_members", params={"select": "*", "order": "id.asc"})

            rows = _with_user_identity(rows)
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

            member = _apply_user_identity(member, _get_user_identity(member.get("user_id")))

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
