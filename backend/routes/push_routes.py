"""
routes/push_routes.py

Endpoints for Web Push subscription management.
  GET  /api/push/vapid-public-key   — public key for PushManager.subscribe()
  POST /api/push/subscribe          — save a browser's push subscription
  POST /api/push/unsubscribe        — remove a push subscription
"""

from flask import Blueprint, request, jsonify

from services.push_service import VAPID_PUBLIC_KEY, save_subscription, remove_subscription

push_bp = Blueprint("push_notifications", __name__, url_prefix="/api/push")


@push_bp.route("/vapid-public-key", methods=["GET"])
def get_vapid_public_key():
    return jsonify({"publicKey": VAPID_PUBLIC_KEY}), 200


@push_bp.route("/subscribe", methods=["POST"])
def subscribe():
    body = request.get_json(silent=True) or {}
    try:
        save_subscription(body.get("employee_id"), body.get("subscription") or {})
        return jsonify({"message": "Subscribed"}), 200
    except ValueError as exc:
        return jsonify({"message": str(exc)}), 400
    except Exception as exc:
        return jsonify({"message": str(exc)}), 500


@push_bp.route("/unsubscribe", methods=["POST"])
def unsubscribe():
    body = request.get_json(silent=True) or {}
    remove_subscription(body.get("endpoint"))
    return jsonify({"message": "Unsubscribed"}), 200
