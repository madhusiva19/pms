"""
services/push_service.py
--------------------------
Web Push notifications (VAPID) — shows a native OS/browser popup for new
personal notifications, even when the tab is in the background, a different
app is focused, or the browser is fully closed.

Self-contained by design: it only reads rows from the existing
`notifications` table (the same rows already returned by
GET /api/notifications/<employee_id>, i.e. the sidebar bell badge) and
writes to its own new `push_subscriptions` table. It does not modify any
other notification code path (diary, manual-rating, evaluation, or cutoff
notifications), so it can't affect those features.
"""

import os
import json
import logging
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from pywebpush import webpush, WebPushException

from models.supabase_client import supabase

log = logging.getLogger(__name__)

VAPID_PUBLIC_KEY   = os.getenv("VAPID_PUBLIC_KEY")
VAPID_PRIVATE_KEY  = os.getenv("VAPID_PRIVATE_KEY")
VAPID_CLAIMS_EMAIL = os.getenv("VAPID_CLAIMS_EMAIL", "mailto:admin@example.com")

POLL_INTERVAL_SECONDS = 30


# ─────────────────────────────────────────────────────────────────────────────
# SUBSCRIPTION MANAGEMENT
# ─────────────────────────────────────────────────────────────────────────────

def save_subscription(employee_id: str, subscription: dict) -> None:
    endpoint = subscription.get("endpoint")
    keys     = subscription.get("keys", {})
    if not employee_id or not endpoint or not keys.get("p256dh") or not keys.get("auth"):
        raise ValueError("Invalid subscription payload")

    supabase.table("push_subscriptions").upsert({
        "employee_id": employee_id,
        "endpoint":    endpoint,
        "p256dh":      keys["p256dh"],
        "auth":        keys["auth"],
    }, on_conflict="endpoint").execute()


def remove_subscription(endpoint: str) -> None:
    if not endpoint:
        return
    supabase.table("push_subscriptions").delete().eq("endpoint", endpoint).execute()


# ─────────────────────────────────────────────────────────────────────────────
# SENDING
# ─────────────────────────────────────────────────────────────────────────────

def _send_to_subscription(row: dict, title: str, body: str, url: str) -> None:
    subscription_info = {
        "endpoint": row["endpoint"],
        "keys": {"p256dh": row["p256dh"], "auth": row["auth"]},
    }
    try:
        webpush(
            subscription_info=subscription_info,
            data=json.dumps({"title": title, "body": body, "url": url}),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims={"sub": VAPID_CLAIMS_EMAIL},
        )
    except WebPushException as exc:
        status = getattr(exc.response, "status_code", None)
        if status in (404, 410):
            # subscription is stale (user revoked permission / cleared browser data)
            remove_subscription(row["endpoint"])
        else:
            log.warning("[push] webpush failed for endpoint %s: %s", row["endpoint"][:60], exc)
    except Exception as exc:
        log.warning("[push] unexpected send error: %s", exc)


def send_push_to_employee(employee_id: str, title: str, body: str, url: str = "/") -> None:
    if not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY or not employee_id:
        return
    rows = (
        supabase.table("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("employee_id", employee_id)
        .execute()
        .data
        or []
    )
    for row in rows:
        _send_to_subscription(row, title, body, url)


# ─────────────────────────────────────────────────────────────────────────────
# POLLER — dispatches a push for any newly-created personal notification
# ─────────────────────────────────────────────────────────────────────────────

# One tracked table per notification source that should trigger a popup.
# (table_name, recipient_column, url_column_or_None, skip_types)
# skip_types: row "type" values that should stay panel-only (no popup) —
# e.g. an FYI/cc notification alongside the actionable one for the same event.
_POLLED_TABLES = [
    ("notifications", "receiver_id", "action_link", set()),
    ("potential_assessment_notifications", "recipient_id", None, {"reconsideration_fyi"}),
    ("manual_rating_notifications", "recipient_id", None, set()),
]

_last_checked_at = {table: datetime.now(timezone.utc) for table, _, _, _ in _POLLED_TABLES}


def _poll_table(table: str, recipient_col: str, url_col: str | None, skip_types: set) -> None:
    since = _last_checked_at[table].isoformat()
    select_cols = f"{recipient_col}, title, message, created_at, type"
    if url_col:
        select_cols += f", {url_col}"

    try:
        rows = (
            supabase.table(table)
            .select(select_cols)
            .not_.is_(recipient_col, "null")
            .gt("created_at", since)
            .order("created_at")
            .execute()
            .data
            or []
        )
    except Exception as exc:
        log.error("[push] poll(%s) failed: %s", table, exc)
        return

    latest = _last_checked_at[table]
    for row in rows:
        if row.get("type") not in skip_types:
            send_push_to_employee(
                row[recipient_col],
                row.get("title") or "New notification",
                row.get("message") or "",
                (row.get(url_col) if url_col else None) or "/",
            )
        try:
            created_at = datetime.fromisoformat(str(row["created_at"]).replace("Z", "+00:00"))
            latest = max(latest, created_at)
        except (ValueError, TypeError):
            pass

    _last_checked_at[table] = latest if rows else datetime.now(timezone.utc)


def _poll_and_dispatch() -> None:
    for table, recipient_col, url_col, skip_types in _POLLED_TABLES:
        _poll_table(table, recipient_col, url_col, skip_types)


def init_push_scheduler() -> None:
    """Call once from app.py during startup. No-op if VAPID keys aren't configured."""
    if not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY:
        log.warning("[push] VAPID_PRIVATE_KEY / VAPID_PUBLIC_KEY not set — push notifications disabled.")
        return

    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        func=_poll_and_dispatch,
        trigger=IntervalTrigger(seconds=POLL_INTERVAL_SECONDS),
        id="push_notification_poll",
        name="Dispatch web push for new personal notifications",
        replace_existing=True,
    )
    scheduler.start()
    log.info("[push] scheduler started — polling every %ss", POLL_INTERVAL_SECONDS)
