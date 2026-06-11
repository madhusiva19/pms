"""Employee enquiry business logic."""

from datetime import datetime, timedelta

from flask import current_app, jsonify, request

from .evaluation_common import *

from .evaluation_notification_service import create_notification


def create_enquiry():
    """Create an employee enquiry and notify the evaluator's superior."""

    data = request.get_json(silent=True) or {}
    employee_name, employee_error = required_text(data, "employee_name", "Employee name")
    evaluator_name, evaluator_error = required_text(data, "evaluator_name", "Evaluator name")
    reason, reason_error = required_text(data, "reason", "Reason for enquiry")
    request_type = clean_text(data.get("request_type")) or "re_evaluation"

    # Validate the required text fields before creating the enquiry record.
    for error in (employee_error, evaluator_error, reason_error):
        if error:
            return error_response(error, 400)

    if request_type not in VALID_ENQUIRY_REQUEST_TYPES:
        return error_response("Request type must be re_evaluation", 400)

    enquiry_payload = {
        "employee_id": data.get("employee_id"),
        "related_evaluation_id": data.get("related_evaluation_id"),
        "employee_name": employee_name,
        "employee_role": clean_text(data.get("employee_role")),
        "evaluator_name": evaluator_name,
        "current_stage": clean_text(data.get("current_stage")),
        "current_status": clean_text(data.get("current_status")),
        "reason": reason,
        "additional_comments": clean_text(data.get("additional_comments")),
        "request_type": request_type,
        "status": "pending",
        "created_at": datetime.utcnow().isoformat(),
    }

    enquiry = None
    if USE_SUPABASE:
        try:
            rows = supabase_request("enquiries", method="POST", payload=enquiry_payload)
            enquiry = rows[0] if rows else enquiry_payload
        except Exception as error:
            current_app.logger.warning("Falling back to in-memory enquiry: %s", error)

    if enquiry is None:
        enquiry = {"id": len(enquiries) + 1, **enquiry_payload}
        enquiries.append(enquiry)

    # Enquiries are surfaced through the notification center for the evaluator's
    # superior or admin reviewer.
    notification = create_notification(
        "enquiry",
        "Re-evaluation Enquiry",
        f"Employee {employee_name} has requested a re-evaluation regarding the evaluation submitted by Evaluator {evaluator_name}.",
        data.get("related_evaluation_id"),
    )

    return jsonify({"message": "Enquiry submitted", "enquiry": enquiry, "notification": notification}), 201
