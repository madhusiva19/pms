"""Shared constants, fallback stores, normalizers, and data helpers."""

from datetime import datetime, timedelta

from flask import current_app, jsonify

from models.supabase_client import (
    SUPABASE_KEY,
    SUPABASE_URL,
    TABLE_ALIASES,
    USE_SUPABASE,
    raw_supabase_request,
    resolve_table_name,
    supabase_request,
)

VALID_MEMBER_STATUSES = {"pending", "in progress", "completed"}
VALID_ENQUIRY_REQUEST_TYPES = {"re_evaluation"}
MAX_TEXT_LENGTH = 1000

# Default workflow labels used when the database does not provide a value.
DEFAULT_EVALUATION_PERIOD = "Annual Performance 2024"
DEFAULT_EVALUATOR_NAME = "Group Admin"
DEFAULT_APPROVAL_LEVEL = "Level 1 (Manager)"

def error_response(message, status_code=400):
    """Return a consistent validation/error response shape."""

    return jsonify({"error": message}), status_code


def clean_text(value, max_length=MAX_TEXT_LENGTH):
    """Convert text input to a safe stripped string with a small length limit."""

    if value is None:
        return ""
    return str(value).strip()[:max_length]


def required_text(data, field_name, label):
    """Read a required text field and return an error message when it is empty."""

    value = clean_text(data.get(field_name))
    if not value:
        return None, f"{label} is required"
    return value, None


# Empty in-memory stores are used only as a safe fallback when database access fails.
team_members = []
approvals = []
notifications = []
evaluation_status = []
enquiries = []


# =====================
# Data Normalizers
# =====================
# Normalizers convert database naming styles into frontend-friendly response
# shapes. This keeps React pages from needing to know every possible DB column
# spelling used by the existing Supabase schema.


def normalize_status_value(status):
    """Normalize a status value for comparisons and display."""

    if not isinstance(status, str):
        return status
    return status.replace("_", " ").strip().lower()


def normalize_member(member):
    """Convert a team member row into the TeamMember API shape."""

    normalized = dict(member)
    if "overall_score" in normalized:
        normalized["overallScore"] = normalized.pop("overall_score")
    if "full_name" in normalized and "name" not in normalized:
        normalized["name"] = normalized.pop("full_name")
    if "designation" in normalized and "role" not in normalized:
        normalized["role"] = normalized.pop("designation")
    if "performance_score" in normalized and "overallScore" not in normalized:
        normalized["overallScore"] = normalized.pop("performance_score")
    if "status" in normalized:
        normalized["status"] = normalize_status_value(normalized["status"])
    return normalized


def normalize_approval(approval):
    """Convert an approval row into the Approval API shape."""

    normalized = dict(approval)
    if "evaluation_by" in normalized:
        normalized["evaluationBy"] = normalized.pop("evaluation_by")
    if "due_date" in normalized:
        normalized["dueDate"] = normalized.pop("due_date")
    if "approval_level" in normalized and "level" not in normalized:
        normalized["level"] = normalized.pop("approval_level")
    if "employee_name" in normalized and "employee" not in normalized:
        normalized["employee"] = normalized.pop("employee_name")
    if "evaluator_name" in normalized and "evaluationBy" not in normalized:
        normalized["evaluationBy"] = normalized.pop("evaluator_name")
    if "approved_by_name" in normalized and "evaluationBy" not in normalized:
        normalized["evaluationBy"] = normalized.pop("approved_by_name")
    if "status" in normalized:
        normalized["status"] = normalize_status_value(normalized["status"])
    return normalized


def normalize_notification(notification):
    """Convert a notification row into the NotificationItem API shape."""

    normalized = dict(notification)
    if "notification_id" in normalized and "id" not in normalized:
        normalized["id"] = normalized["notification_id"]
    if "notification_type" in normalized:
        normalized["type"] = normalized.pop("notification_type")
    if "notification_title" in normalized and "title" not in normalized:
        normalized["title"] = normalized.pop("notification_title")
    if "created_at" in normalized and not normalized.get("timestamp"):
        normalized["timestamp"] = normalized["created_at"]
    if "createdAt" in normalized and not normalized.get("timestamp"):
        normalized["timestamp"] = normalized["createdAt"]
    if "message" in normalized and "description" not in normalized:
        normalized["description"] = normalized.pop("message")
    normalized.setdefault("type", "general")
    normalized.setdefault("title", "Notification")
    normalized.setdefault("description", "")
    normalized.setdefault("timestamp", "Just now")
    normalized.setdefault("is_read", False)
    return normalized


def notification_id_column(notification):
    """Choose the notification primary key column used by the current table."""

    if "notification_id" in notification:
        return "notification_id"
    return "id"


def normalize_status(status):
    """Convert an evaluation status row into the frontend workflow shape."""

    normalized = dict(status)
    if "rejection_comments" in normalized:
        normalized["rejectionComments"] = normalized.pop("rejection_comments")
    if "member_id" in normalized and "id" not in normalized:
        normalized["id"] = normalized["member_id"]
    if "employee_id" in normalized and "id" not in normalized:
        normalized["id"] = normalized["employee_id"]
    if "current_stage" in normalized and not normalized.get("stages"):
        normalized["currentStage"] = normalized["current_stage"]
    return normalized


def fetch_first(table, column, value, missing_ok=False):
    """Fetch the first row that matches a column value."""

    # Supabase REST filters use "eq.<value>" syntax, so callers only pass the
    # logical table/column and the raw value they are searching for.
    try:
        rows = supabase_request(table, params={"select": "*", column: f"eq.{value}", "limit": 1})
    except Exception:
        if missing_ok:
            return None
        raise
    return rows[0] if rows else None


def fetch_rows(table, params=None, missing_ok=True):
    """Fetch many rows and optionally return an empty list when a table is missing."""

    try:
        return supabase_request(table, params=params or {"select": "*"})
    except Exception:
        if missing_ok:
            return []
        raise


def get_member_name(member_id):
    """Resolve a team member ID into a display name."""

    member = fetch_first("team_members", "id", member_id, missing_ok=True)
    return normalize_member(member).get("name") if member else None


def get_member_by_name(name):
    """Find a team member row using its display name."""

    if not name:
        return None

    rows = fetch_rows("team_members", params={"select": "*", "limit": 1000})
    normalized_name = str(name).strip().lower()
    for row in rows:
        member = normalize_member(row)
        if str(member.get("name", "")).strip().lower() == normalized_name:
            return member
    return None


def get_user_for_member(member, create_if_missing=False):
    """Find or create the user row linked to a team member."""

    if not member:
        return None

    normalized_member = normalize_member(member)
    member_email = str(normalized_member.get("email") or "").strip().lower()
    member_name = str(normalized_member.get("name") or "").strip().lower()
    users = fetch_rows("users", params={"select": "*", "limit": 1000})

    for user in users:
        user_email = str(user.get("email") or "").strip().lower()
        user_name = str(user_display_name(user) or "").strip().lower()
        if member_email and user_email == member_email:
            return user
        if member_name and user_name == member_name:
            return user

    if create_if_missing:
        # Some evaluation/approval tables reference users instead of team
        # members. Create a lightweight user row when the schema requires it.
        safe_name = normalized_member.get("name") or f"Employee {normalized_member.get('id')}"
        safe_email = normalized_member.get("email") or f"team-member-{normalized_member.get('id')}@local.app"
        try:
            rows = supabase_request(
                "users",
                method="POST",
                payload={
                    "email": safe_email,
                    "full_name": safe_name,
                    "role": "employee",
                    "department": normalized_member.get("department"),
                    "is_active": True,
                    "updated_at": datetime.utcnow().isoformat(),
                },
            )
            return rows[0] if rows else None
        except Exception as error:
            current_app.logger.info("Could not create linked user for team member %s: %s", normalized_member.get("id"), error)

    return None


def get_user_name(user_id):
    """Resolve a user ID into a display name."""

    if not user_id:
        return None
    user = fetch_first("users", "id", user_id, missing_ok=True)
    if not user:
        return None
    return user_display_name(user)


def user_display_name(user):
    """Build the best available display name from a user row."""

    return (
        user.get("full_name")
        or user.get("fullName")
        or user.get("display_name")
        or user.get("displayName")
        or user.get("employee_name")
        or user.get("employeeName")
        or user.get("name")
        or combined_name
        or user.get("username")
        or user.get("email")
    )


def build_id_name_map(table, normalizer, name_key="name"):
    """Build an ID-to-name map for lookup-heavy response normalization."""

    rows = fetch_rows(table, params={"select": "*", "limit": 1000})
    mapped = {}
    for row in rows:
        normalized = normalizer(row)
        if normalized.get("id"):
            if table == "users":
                mapped[str(normalized["id"])] = user_display_name(normalized)
            else:
                mapped[str(normalized["id"])] = normalized.get(name_key) or normalized.get("email")
    return mapped


def build_evaluation_payload(evaluation):
    """Build the frontend evaluation object, including score rows when present."""

    if not evaluation:
        return None

    payload = dict(evaluation)
    if "evaluation_period" in payload:
        payload["period"] = payload["evaluation_period"]
    if "overall_score" in payload:
        payload["overallScore"] = payload["overall_score"]
    if "admin_recommendation" in payload:
        payload["feedback"] = payload["admin_recommendation"]

    # Evaluation scores are stored separately in some schemas. Attach them to
    # the evaluation response so the frontend can render one complete object.
    scores = fetch_rows("evaluation_scores", params={"select": "*", "evaluation_id": f"eq.{evaluation.get('id')}", "order": "id.asc"})
    if scores:
        payload["objectives"] = [
            {
                "category": "Performance Scores",
                "items": [
                    {
                        "name": score.get("item_name") or score.get("metric_name") or f"Metric {score.get('evaluation_item_id', score.get('id'))}",
                        "weight": score.get("weight"),
                        "target": score.get("target_value") or score.get("target"),
                        "actual": score.get("actual_value") or score.get("actual"),
                        "achieve": score.get("achievement_percentage") or score.get("achieve"),
                        "rating": score.get("rating") or score.get("score"),
                    }
                    for score in scores
                ],
            }
        ]

    return payload


def numeric_or_none(value):
    """Parse numeric API values while safely handling blanks and invalid input."""

    try:
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


# ==========================
# Evaluation Write Helpers
# ==========================
# Submitting an evaluation can create both an evaluation row and a pending
# approval row. These helpers keep that multi-step workflow separate from the
# route handler so it is easier to test and modify.


def create_evaluation_record(data, member):
    """Create the main evaluation row for the evaluated team member."""

    # The Supabase schema may link evaluations to users, while the UI starts
    # from a team member. Resolve that bridge before writing the evaluation.
    period = data.get("period") or data.get("evaluation_period") or DEFAULT_EVALUATION_PERIOD
    linked_user = get_user_for_member(member, create_if_missing=True)
    employee_id = linked_user.get("id") if linked_user else member["id"]
    payload = {
        "employee_id": employee_id,
        "evaluation_period": period,
        "overall_score": numeric_or_none(data.get("overallScore") or member.get("overall_score") or member.get("overallScore")),
        "admin_recommendation": data.get("feedback") or data.get("adminFeedback") or "",
        "status": data.get("status") or "submitted",
        "updated_at": datetime.utcnow().isoformat(),
    }

    try:
        rows = supabase_request("evaluations", method="POST", payload=payload)
        return rows[0] if rows else None
    except Exception as error:
        if "invalid input syntax for type uuid" in str(error) and linked_user:
            current_app.logger.info("Evaluation insert failed with UUID user id too: %s", error)
            return None
        current_app.logger.info("Could not create full evaluation row: %s", error)
        return None


def create_approval_record(data, member, evaluation=None):
    """Create the approval row connected to a submitted evaluation."""

    # This project has used more than one approval table shape. The payload is
    # selected based on the resolved table so old and new schemas both work.
    employee_name = normalize_member(member).get("name") or f"Employee {member['id']}"
    linked_user = get_user_for_member(member, create_if_missing=True)
    due_date = (datetime.utcnow() + timedelta(days=14)).date().isoformat()
    approval_table = resolve_table_name("approvals")

    if approval_table == "approvals":
        payload = {
            "employee": employee_name,
            "evaluation_by": data.get("evaluationBy") or data.get("evaluation_by") or DEFAULT_EVALUATOR_NAME,
            "level": data.get("level") or DEFAULT_APPROVAL_LEVEL,
            "status": "pending",
            "due_date": due_date,
            "updated_at": datetime.utcnow().isoformat(),
        }
    else:
        payload = {
            "evaluation_id": evaluation.get("id") if evaluation else None,
            "employee_id": linked_user.get("id") if linked_user else None,
            "approval_level": data.get("level") or DEFAULT_APPROVAL_LEVEL,
            "approved_by": None,
            "status": "pending",
            "due_date": due_date,
            "updated_at": datetime.utcnow().isoformat(),
        }

    try:
        rows = raw_supabase_request(approval_table, method="POST", payload=payload)
    except Exception as error:
        current_app.logger.info("Approval insert failed on %s: %s", approval_table, error)
        if approval_table != "approvals":
            raise
        simple_payload = {
            "employee": employee_name,
            "evaluation_by": data.get("evaluationBy") or data.get("evaluation_by") or DEFAULT_EVALUATOR_NAME,
            "level": data.get("level") or DEFAULT_APPROVAL_LEVEL,
            "status": "pending",
            "due_date": due_date,
        }
        rows = raw_supabase_request("approvals", method="POST", payload=simple_payload)

    approval = normalize_approval(rows[0]) if rows else {}
    approval["employee"] = approval.get("employee") or employee_name
    approval["employee_id"] = approval.get("employee_id") or member["id"]
    approval["team_member_id"] = approval.get("team_member_id") or member["id"]
    approval["evaluationBy"] = approval.get("evaluationBy") or data.get("evaluationBy") or DEFAULT_EVALUATOR_NAME
    approval["level"] = approval.get("level") or data.get("level") or DEFAULT_APPROVAL_LEVEL
    return approval


def table_status():
    """Report which logical tables can be resolved in Supabase."""

    statuses = {}
    for key in TABLE_ALIASES:
        try:
            statuses[key] = resolve_table_name(key)
        except Exception:
            statuses[key] = "missing"
    return statuses


def fallback_response(data, status=200):
    """Return data from the empty in-memory fallback store."""

    # The header makes fallback responses visible during debugging without
    # changing the JSON shape expected by the frontend.
    response = jsonify(data)
    response.headers["X-Data-Source"] = "memory"
    return response, status
