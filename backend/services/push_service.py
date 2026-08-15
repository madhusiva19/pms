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

_last_checked_at = datetime.now(timezone.utc)


def _poll_and_dispatch() -> None:
    global _last_checked_at

    since = _last_checked_at.isoformat()
    try:
        rows = (
            supabase.table("notifications")
            .select("receiver_id, title, message, action_link, created_at")
            .not_.is_("receiver_id", "null")
            .gt("created_at", since)
            .order("created_at")
            .execute()
            .data
            or []
        )
    except Exception as exc:
        log.error("[push] poll failed: %s", exc)
        return

    latest = _last_checked_at
    for row in rows:
        send_push_to_employee(
            row["receiver_id"],
            row.get("title") or "New notification",
            row.get("message") or "",
            row.get("action_link") or "/",
        )
        try:
            created_at = datetime.fromisoformat(str(row["created_at"]).replace("Z", "+00:00"))
            latest = max(latest, created_at)
        except (ValueError, TypeError):
            pass

    _last_checked_at = latest if rows else datetime.now(timezone.utc)


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
