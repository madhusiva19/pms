"""
services/notification_service.py
----------------------------------
Business logic for manual-rating notification broadcasts.

Responsibilities
----------------
- Broadcast system-generated notifications when rating windows open/close
  or when deadlines approach.
- Send one-to-one supervisor reminders.
- Validate sender–recipient relationships before inserting records.

This service does NOT define Flask routes — see routes/notifications.py.
"""

from utils.db import supabase


# ---------------------------------------------------------------------------
# Broadcast helpers
# ---------------------------------------------------------------------------

def _get_valid_manager_ids(evaluators: list[dict]) -> set[str]:
    """
    Given a list of evaluator user dicts, resolve which of their manager_ids
    actually exist in the users table.

    Returns a set of valid manager UUIDs so we can safely send upward
    notifications without creating orphaned records.
    """
    all_manager_ids = list({
        e["manager_id"]
        for e in evaluators
        if e.get("manager_id")
    })

    if not all_manager_ids:
        return set()

    rows = (
        supabase.table("users")
        .select("id")
        .in_("id", all_manager_ids)
        .execute()
        .data
        or []
    )

    return {r["id"] for r in rows}


def _count_manual_objectives(template_id: int) -> int:
    """Return how many manual KPI objectives exist for a given template."""
    cat_res = (
        supabase.table("categories")
        .select("id")
        .eq("template_id", template_id)
        .execute()
    )
    cat_ids = [c["id"] for c in (cat_res.data or [])]

    if not cat_ids:
        return 0

    obj_res = (
        supabase.table("objectives")
        .select("id")
        .in_("category_id", cat_ids)
        .eq("kpi_scale", "manual")
        .execute()
    )
    return len(obj_res.data or [])


def _count_submitted(user_id: str, period: str, pms_year: int) -> int:
    """Return how many manual ratings this user has already submitted."""
    res = (
        supabase.table("performance_records")
        .select("objective_id")
        .eq("user_id", user_id)
        .eq("period", period)
        .eq("year", pms_year)
        .not_.is_("manual_rating", "null")
        .execute()
    )
    return len(res.data or [])


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------

def broadcast_notifications(
    notif_type: str,
    period: str,
    pms_year: int,
) -> int:
    """
    Build and insert system notifications for all eligible evaluators based
    on the notification type.

    Supported types
    ---------------
    ``period_opened``   : Sent once when the rating window opens.
    ``deadline_warning``: Sent when the deadline is 3 days away (pending only).
    ``period_closed``   : Sent after the window closes for evaluators with
                          outstanding ratings (directed at their managers).

    Returns
    -------
    int : Number of notification rows inserted.
    """
    # hq_admin is excluded — they manage templates, not ratings
    evaluator_roles = ["branch_admin", "dept_admin", "sub_dept_admin", "country_admin"]

    evaluators = (
        supabase.table("users")
        .select("id, full_name, manager_id, role")
        .in_("role", evaluator_roles)
        .execute()
        .data
        or []
    )

    # Pre-validate manager IDs to avoid inserting orphaned recipient rows
    valid_manager_ids = _get_valid_manager_ids(evaluators)
    notifications_to_insert: list[dict] = []

    for evaluator in evaluators:
        # Only target evaluators who have a template assigned
        assign_res = (
            supabase.table("template_assignments")
            .select("template_id")
            .eq("user_id", evaluator["id"])
            .limit(1)
            .execute()
        )
        if not assign_res.data:
            continue

        template_id  = assign_res.data[0]["template_id"]
        total_manual = _count_manual_objectives(template_id)
        submitted    = _count_submitted(evaluator["id"], period, pms_year)
        pending      = max(0, total_manual - submitted)
        manager_id   = evaluator.get("manager_id")
        # Use None if the manager UUID doesn't exist in the users table
        valid_manager = manager_id if manager_id in valid_manager_ids else None

        # ── period_opened ──────────────────────────────────────────────────
        if notif_type == "period_opened":
            notifications_to_insert.append({
                "recipient_id": evaluator["id"],
                "sender_id":    None,
                "type":         "period_opened",
                "title":        f"Manual Rating Window Open — {period} {pms_year}",
                "message": (
                    f"The manual rating window for {period} {pms_year} is now open. "
                    f"You have {total_manual} manual KPI(s) to rate. "
                    "Please complete all ratings before the deadline."
                ),
                "period":   period,
                "pms_year": pms_year,
                "is_read":  False,
            })

        # ── deadline_warning ───────────────────────────────────────────────
        elif notif_type == "deadline_warning" and pending > 0:
            plural = "s" if pending > 1 else ""

            # Notify the evaluator themselves
            notifications_to_insert.append({
                "recipient_id": evaluator["id"],
                "sender_id":    None,
                "type":         "deadline_warning",
                "title":        f"Manual Ratings Due in 3 Days — {period} {pms_year}",
                "message": (
                    f"You have {pending} pending manual rating{plural} due in 3 days "
                    f"for {period} {pms_year}. "
                    "Please complete them before the window closes."
                ),
                "period":   period,
                "pms_year": pms_year,
                "is_read":  False,
            })

            # Also alert their manager
            if valid_manager:
                notifications_to_insert.append({
                    "recipient_id": valid_manager,
                    "sender_id":    None,
                    "type":         "supervisor_alert",
                    "title":        f"Team Member Has Pending Ratings — {period} {pms_year}",
                    "message": (
                        f"{evaluator['full_name']} has {pending} pending manual "
                        f"rating{plural} due in 3 days for {period} {pms_year}. "
                        "Please follow up."
                    ),
                    "period":   period,
                    "pms_year": pms_year,
                    "is_read":  False,
                })

        # ── period_closed ──────────────────────────────────────────────────
        elif notif_type == "period_closed" and pending > 0 and valid_manager:
            plural = "s" if pending > 1 else ""

            notifications_to_insert.append({
                "recipient_id": valid_manager,
                "sender_id":    None,
                "type":         "supervisor_alert",
                "title":        f"Incomplete Ratings After Period Closed — {period} {pms_year}",
                "message": (
                    f"{evaluator['full_name']} has {pending} incomplete manual "
                    f"rating{plural} after the {period} {pms_year} window has closed."
                ),
                "period":   period,
                "pms_year": pms_year,
                "is_read":  False,
            })

    if notifications_to_insert:
        supabase.table("manual_rating_notifications").insert(
            notifications_to_insert
        ).execute()

    return len(notifications_to_insert)


def send_reminder(
    sender_id: str,
    recipient_id: str,
    period: str,
    pms_year: int,
    message: str,
) -> dict:
    """
    Insert a one-to-one manual_reminder notification from a manager to a
    direct report.

    Raises
    ------
    ValueError : if the sender is not the direct manager of the recipient.

    Returns
    -------
    dict : ``{"success": True}`` on success.
    """
    # Verify the recipient exists and that sender is their direct manager
    recipient_res = (
        supabase.table("users")
        .select("id, full_name, manager_id")
        .eq("id", recipient_id)
        .single()
        .execute()
    )

    if not recipient_res.data:
        raise ValueError("Recipient not found")

    if str(recipient_res.data.get("manager_id")) != str(sender_id):
        raise PermissionError("Sender is not the direct manager of this recipient")

    # Resolve sender's display name for the message
    sender_res = (
        supabase.table("users")
        .select("full_name")
        .eq("id", sender_id)
        .single()
        .execute()
    )
    sender_name = (
        sender_res.data.get("full_name", "Your Supervisor")
        if sender_res.data
        else "Your Supervisor"
    )

    # Fallback message when caller didn't provide one
    final_message = message or (
        f"{sender_name} has requested you complete your pending manual "
        f"ratings for {period} {pms_year} urgently."
    )

    supabase.table("manual_rating_notifications").insert({
        "recipient_id": recipient_id,
        "sender_id":    sender_id,
        "type":         "manual_reminder",
        "title":        "Manual Rating Reminder",
        "message":      final_message,
        "period":       period,
        "pms_year":     pms_year,
        "is_read":      False,
    }).execute()

    return {"success": True}