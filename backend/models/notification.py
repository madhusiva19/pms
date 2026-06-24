"""
models/notification.py
-----------------------
Type definitions for notification data structures.

These are plain TypedDicts — no ORM, no DB calls.
"""

from typing import Optional
from typing_extensions import TypedDict


# Valid notification type identifiers stored in the DB
NOTIFICATION_TYPES = (
    "period_opened",
    "deadline_warning",
    "supervisor_alert",
    "manual_reminder",
)


class ManualRatingNotification(TypedDict):
    """
    One row from the ``manual_rating_notifications`` table.
    Covers all four notification types used in the system.
    """
    id:           str
    recipient_id: str
    sender_id:    Optional[str]   # None for system-generated broadcasts
    type:         str             # One of NOTIFICATION_TYPES
    title:        str
    message:      str
    period:       str             # "H1" | "H2"
    pms_year:     int
    is_read:      bool
    created_at:   str             # ISO timestamp


class ReminderPayload(TypedDict):
    """Request body shape for POST /api/manual-rating-notifications/send-reminder."""
    sender_id:    str
    recipient_id: str
    period:       str
    pms_year:     int
    message:      str


class BroadcastPayload(TypedDict):
    """Request body shape for POST /api/manual-rating-notifications/broadcast."""
    type:     str   # One of NOTIFICATION_TYPES
    period:   str
    pms_year: int
