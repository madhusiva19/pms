"""System health business logic."""

from datetime import datetime, timedelta

from flask import current_app, jsonify, request

from .common import *


def index():
    """List available API endpoints for quick browser checks."""

    return jsonify(
        {
            "status": "Backend is running",
            "message": "Use /api/health to check the API and database connection.",
            "endpoints": [
                "/api/health",
                "/api/team-members",
                "/api/performance-summary",
                "/api/performance-records",
                "/api/evaluations",
                "/api/approvals",
                "/api/notifications",
                "/api/evaluation-status/1",
            ],
        }
    ), 200


def health():
    """Check backend status, Supabase credentials, and table availability."""

    db_status = "not_configured"
    db_error = None
    db_hint = None

    if USE_SUPABASE:
        try:
            # A small query is enough to prove credentials and network access.
            supabase_request("team_members", params={"select": "id", "limit": 1})
            db_status = "connected"
        except Exception as error:
            db_status = "error"
            db_error = str(error)
            if "PGRST205" in db_error or "Could not find the table" in db_error:
                db_status = "tables_missing"
                db_hint = "Run SUPABASE_CREATE_TABLES.sql in the Supabase SQL Editor for this exact project URL, then wait a few seconds and refresh."

    return jsonify(
        {
            "status": "Server is running",
            "supabase": db_status,
            "supabaseUrlConfigured": bool(SUPABASE_URL),
            "supabaseKeyConfigured": bool(SUPABASE_KEY),
            # table_status resolves logical table aliases used throughout the
            # service layer and helps diagnose schema naming mismatches.
            "tables": table_status() if USE_SUPABASE else {},
            "error": db_error,
            "hint": db_hint,
        }
    ), 200
