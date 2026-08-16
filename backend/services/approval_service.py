"""Approval workflow business logic."""

from datetime import datetime, timedelta

from flask import current_app, jsonify, request

from .common import *

from .notification_service import create_notification


def get_approvals():
    """Return approval rows for the approvals table.

    Only completed team members are eligible for review. Their approval row is
    the source of truth for the approval-page status: pending, approved, or
    rejected.
    """

    if USE_SUPABASE:
        try:
            approval_table = resolve_table_name("approvals")
            manager_id = request.args.get("manager_id")

            # When manager_id is supplied, scope to that manager's direct reports.
            team_member_filter = None
            tm_ids = []
            if manager_id:
                user_rows = fetch_rows("users", {"select": "id", "manager_id": f"eq.{manager_id}"})
                user_ids  = [str(u["id"]) for u in (user_rows or [])]
                if user_ids:
                    tm_rows = fetch_rows("team_members", {"select": "id", "user_id": f"in.({','.join(user_ids)})"})
                    tm_ids  = [str(t["id"]) for t in (tm_rows or [])]
                    team_member_filter = f"in.({','.join(tm_ids)})" if tm_ids else None

            # One query: join team_members for employee name and evaluations
            # for period / overall_score.
            query_params = {
                    "select": (
                        "*,"
                        "team_members(id,full_name,name,designation,role,email),"
                        "evaluations(id,overall_score,period,admin_recommendation)"
                    ),
                    "order": "id.desc",
                    "limit": 200,
            }
            if team_member_filter:
                query_params["team_member_id"] = team_member_filter
            elif manager_id and not tm_ids:
                # Manager has no linked team members via users table.
                rows = []
            if "rows" not in locals():
                rows = raw_supabase_request(approval_table, params=query_params) or []

            # Mirrors ROLE_EVALUATOR_LABEL in the frontend constants.
            ROLE_EVALUATOR = {
                'country_admin':  'HQ Admin',
                'branch_admin':   'Country Admin',
                'dept_admin':     'Branch Admin',
                'sub_dept_admin': 'Department Admin',
                'employee':       'Sub Department Admin',
            }

            # Fetch users once for employee_id / approved_by name resolution.
            all_users = fetch_rows("users", {"select": "id,email,name,first_name,last_name,full_name,display_name", "limit": 2000}) or []
            user_map  = {str(u.get("id", "")): user_display_name(u) or u.get("email", "") for u in all_users}

            seen_members: set = set()
            normalized_rows = []
            for row in rows:
                approval = normalize_approval(row)

                # ── Employee name & role ───────────────────────────────────────
                tm = row.get("team_members") or {}
                member_role = None
                if isinstance(tm, dict) and tm:
                    approval["employee"] = (
                        tm.get("full_name") or tm.get("name") or approval.get("employee")
                    )
                    approval["team_member_id"] = tm.get("id") or approval.get("team_member_id")
                    member_role = tm.get("role")
                    # Level = the employee's own designation / role label
                    approval["level"] = tm.get("designation") or tm.get("role") or DEFAULT_APPROVAL_LEVEL

                # Fallback: employee_id → users map
                if not approval.get("employee") and approval.get("employee_id"):
                    approval["employee"] = user_map.get(str(approval["employee_id"])) or "Unknown Employee"

                # ── Evaluation By = the admin directly above this employee ─────
                evaluator = ROLE_EVALUATOR.get(member_role or "") if member_role else None
                if evaluator:
                    approval["evaluationBy"] = evaluator
                elif approval.get("approved_by"):
                    approval["evaluationBy"] = user_map.get(str(approval["approved_by"])) or DEFAULT_EVALUATOR_NAME
                else:
                    approval["evaluationBy"] = DEFAULT_EVALUATOR_NAME

                # ── Evaluation metadata ────────────────────────────────────────
                ev = row.get("evaluations") or {}
                if isinstance(ev, dict) and ev:
                    approval.setdefault("period",        ev.get("period"))
                    approval.setdefault("overall_score", ev.get("overall_score"))
                    approval.setdefault("evaluation_id", ev.get("id"))

                # ── Deduplicate: one record per team member (newest wins) ───────
                member_key = str(approval.get("team_member_id") or approval.get("employee") or "")
                if member_key and member_key in seen_members:
                    continue
                if member_key:
                    seen_members.add(member_key)

                normalized_rows.append(approval)

            # ── Keep only currently completed team members ───────────────────
            # The team-member status is the eligibility rule. An old approval
            # row must disappear if that member is no longer completed.
            completed_q = {
                "select": "id,full_name,name,designation,role,user_id",
                "status": "eq.completed",
                "order": "id.desc",
                "limit": 200,
            }
            if team_member_filter:
                completed_q["id"] = team_member_filter
            # A manager with no direct reports has no eligible approvals. Do
            # not fall back to all completed members, which leaks other teams
            # into the current evaluator's Approval page.
            completed_members = (
                [] if manager_id and not tm_ids
                else fetch_rows("team_members", completed_q) or []
            )
            completed_by_id = {str(tm.get("id")): tm for tm in completed_members if tm.get("id") is not None}
            completed_by_user_id = {
                str(tm.get("user_id")): tm
                for tm in completed_members
                if tm.get("user_id") is not None
            }
            completed_by_name = {
                str(tm.get("full_name") or tm.get("name") or "").strip().lower(): tm
                for tm in completed_members
                if tm.get("full_name") or tm.get("name")
            }

            eligible_rows = []
            seen_tm_ids = set()
            for approval in normalized_rows:
                member = completed_by_id.get(str(approval.get("team_member_id")))
                if not member:
                    member = completed_by_user_id.get(str(approval.get("employee_id")))
                if not member:
                    member = completed_by_name.get(str(approval.get("employee") or "").strip().lower())
                if not member:
                    continue

                member_id = str(member.get("id"))
                if member_id in seen_tm_ids:
                    continue
                seen_tm_ids.add(member_id)
                approval["team_member_id"] = member.get("id")
                approval["employee_id"] = approval.get("employee_id") or member.get("user_id")
                eligible_rows.append(approval)

            # A completed member receives one persisted Pending record the
            # first time they appear here. This gives Review a real approval ID
            # instead of a generated placeholder and keeps future status reads
            # authoritative.
            for tm in completed_members:
                tm_id = str(tm.get("id", ""))
                if tm_id and tm_id in seen_tm_ids:
                    continue
                approval = create_approval_record({}, tm)
                if not approval:
                    continue
                member_role = tm.get("role") or tm.get("designation") or ""
                approval["employee"] = approval.get("employee") or tm.get("full_name") or tm.get("name") or "Unknown"
                approval["team_member_id"] = tm.get("id")
                approval["employee_id"] = approval.get("employee_id") or tm.get("user_id")
                approval["level"] = approval.get("level") or tm.get("designation") or member_role
                approval["evaluationBy"] = approval.get("evaluationBy") or ROLE_EVALUATOR.get(member_role, DEFAULT_EVALUATOR_NAME)
                approval["status"] = normalize_status_value(approval.get("status")) or "pending"
                eligible_rows.append(approval)

            return jsonify(eligible_rows), 200
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
            elif normalized.get("employee") and not normalized.get("team_member_id"):
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


ROLE_TO_STAGE = {
    'employee':       'Sub Dept Admin Evaluation',
    'sub_dept_admin': 'Dept Admin Approval',
    'dept_admin':     'Branch Admin Review',
    'branch_admin':   'Country Admin Final Approval',
    'country_admin':  'HQ Admin Finalization',
}


def _complete_evaluation_stage(member_id):
    """Mark the evaluation stage for member_id as completed based on their role."""
    try:
        member = fetch_first("team_members", "id", member_id, missing_ok=True)
        member_role = (member or {}).get("role") or (member or {}).get("designation")
        stage_name = ROLE_TO_STAGE.get(member_role or "")
        if not stage_name:
            return
        ev_status = fetch_first("evaluation_status", "member_id", member_id, missing_ok=True)
        if not ev_status:
            ev_status = fetch_first("evaluation_status", "employee_id", member_id, missing_ok=True)
        if ev_status:
            supabase_request(
                "evaluation_stages",
                method="PATCH",
                params={
                    "evaluation_status_id": f"eq.{ev_status['id']}",
                    "stage_name": f"eq.{stage_name}",
                },
                payload={
                    "stage_status": "completed",
                    "stage_date": datetime.utcnow().date().isoformat(),
                },
            )
    except Exception as err:
        from flask import current_app as _app
        _app.logger.warning("Could not update evaluation stage on approval: %s", err)


def update_approval(approval_id):
    """Approve or reject an approval and create a workflow notification."""

    data = request.get_json(silent=True) or {}
    status_value = data.get("status")
    normalized_status = normalize_status_value(status_value)
    if normalized_status not in {"approved", "rejected"}:
        return error_response("Approval status must be approved or rejected", 400)
    # Rejection comments are sent from the frontend but cannot be stored in the
    # approvals table (no column). Include them in the notification description
    # so reviewers can still see the reason on the Notifications page.
    rejection_comments = data.get("comments", "").strip()

    # Map approval status changes to notification categories used by the UI.
    notification_type = "approval_required"
    if normalized_status == "approved":
        notification_type = "approval_approved"
    elif normalized_status == "rejected":
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
            employee_name = approval.get("employee", "Employee")
            if normalized_status == "rejected" and rejection_comments:
                description = f"{employee_name}'s evaluation was rejected. Reason: {rejection_comments}"
            else:
                description = f"{employee_name} approval status changed to {normalized_status}."
            create_notification(notification_type, "Approval Status Updated", description)
            if normalized_status == "approved":
                member_id = approval.get("team_member_id") or approval.get("employee_id")
                if member_id:
                    _complete_evaluation_stage(member_id)
            return jsonify(approval), 200
        except Exception as error:
            current_app.logger.warning("Falling back to in-memory approval update: %s", error)

    approval = next((a for a in approvals if a["id"] == approval_id), None)
    if not approval:
        return jsonify({"error": "Approval not found"}), 404
    approval["status"] = status_value or approval["status"]
    employee_name = approval.get("employee", "Employee")
    normalized_status = normalize_status_value(approval["status"])
    if normalized_status == "rejected" and rejection_comments:
        description = f"{employee_name}'s evaluation was rejected. Reason: {rejection_comments}"
    else:
        description = f"{employee_name} approval status changed to {normalized_status}."
    create_notification(notification_type, "Approval Status Updated", description)
    return fallback_response(approval)
