"""
tests/test_routes.py
Run with:  pytest tests/test_routes.py -v
"""

import json
from unittest.mock import MagicMock, patch
import pytest
import utils.db


def _chain(data):
    result      = MagicMock()
    result.data = data
    chain       = MagicMock()
    chain.execute.return_value = result
    for m in ("select","eq","neq","in_","not_","is_",
              "order","limit","single","update","insert","delete","upsert"):
        getattr(chain, m).return_value = chain
    return chain


def _set_sb(sb, *, returns=None, side_effects=None):
    sb.table.side_effect  = None
    sb.table.return_value = MagicMock()
    if side_effects is not None:
        sb.table.side_effect = side_effects
    elif returns is not None:
        sb.table.return_value = returns


@pytest.fixture(autouse=True)
def reset_mock():
    sb = utils.db.supabase
    sb.reset_mock()
    sb.table.side_effect  = None
    sb.table.return_value = MagicMock()
    yield


@pytest.fixture
def app():
    from flask import Flask
    from routes.templates_routes     import templates_bp
    from routes.evaluator_routes     import evaluator_bp
    from routes.notification_routes  import notifications_bp
    from routes.org_routes           import org_bp
    flask_app = Flask(__name__)
    flask_app.config["TESTING"] = True
    flask_app.register_blueprint(templates_bp)
    flask_app.register_blueprint(evaluator_bp)
    flask_app.register_blueprint(notifications_bp)
    flask_app.register_blueprint(org_bp)
    return flask_app

@pytest.fixture
def client(app):
    return app.test_client()

@pytest.fixture
def sb():
    import routes.templates_routes as rt
    import routes.evaluator_routes as re
    import routes.notification_routes as rn
    import routes.org_routes as ro
    sb = utils.db.supabase
    for mod in [rt, re, rn, ro]:
        if hasattr(mod, "supabase"):
            mod.supabase = sb
    return sb


# ── Templates ─────────────────────────────────────────────────────

class TestGetTemplates:

    def test_returns_template_list(self, client, sb):
        _set_sb(sb, returns=_chain([
            {"id": 1, "name": "Finance KPI",
             "status": "active", "created_by": "admin"},
            {"id": 2, "name": "Ops KPI",
             "status": "frozen", "created_by": "admin"},
        ]))
        response = client.get("/api/templates")

        assert response.status_code == 200
        assert len(json.loads(response.data)) == 2

    def test_returns_empty_list_when_no_templates(self, client, sb):
        _set_sb(sb, returns=_chain([]))
        response = client.get("/api/templates")

        assert response.status_code == 200
        assert json.loads(response.data) == []

    def test_returns_500_on_supabase_error(self, client, sb):
        sb.table.side_effect = Exception("Connection refused")
        response = client.get("/api/templates")

        assert response.status_code == 500


# ── Evaluator team ────────────────────────────────────────────────

class TestGetEvaluatorTeam:

    def test_returns_team_members(self, client, sb):
        _set_sb(sb, side_effects=[
            _chain([{
                "id": "00000000-0000-0000-0000-000000000011",
                "full_name": "Jane Doe",
                "designation_id": 1,
                "emp_id": "E001",
                "designations": {"name": "Manager"},
            }]),
            _chain([]),
        ])
        response = client.get(
            "/api/evaluator/00000000-0000-0000-0000-000000000001/team"
        )
        assert response.status_code == 200

    def test_returns_empty_list_when_no_reports(self, client, sb):
        _set_sb(sb, returns=_chain([]))
        response = client.get(
            "/api/evaluator/00000000-0000-0000-0000-000000000001/team"
        )
        assert response.status_code == 200


# ── Notifications ─────────────────────────────────────────────────

class TestGetNotifications:

    def test_returns_notification_list(self, client, sb):
        _set_sb(sb, returns=_chain([{
            "id": "00000000-0000-0000-0000-000000000099",
            "type": "period_opened",
            "title": "Window Open", "message": "Rating window is open.",
            "period": "H1", "pms_year": 2025, "is_read": False,
            "recipient_id": "00000000-0000-0000-0000-000000000001",
            "sender_id": None, "created_at": "2025-01-01T00:00:00",
        }]))
        response = client.get(
            "/api/manual-rating-notifications/"
            "00000000-0000-0000-0000-000000000001"
        )
        assert response.status_code == 200
        assert len(json.loads(response.data)) == 1

    def test_returns_empty_list_when_no_notifications(self, client, sb):
        _set_sb(sb, returns=_chain([]))
        response = client.get(
            "/api/manual-rating-notifications/"
            "00000000-0000-0000-0000-000000000001"
        )
        assert response.status_code == 200
        assert json.loads(response.data) == []


class TestMarkNotificationRead:

    def test_marks_notification_as_read(self, client, sb):
        _set_sb(sb, returns=_chain([]))
        response = client.patch(
            "/api/manual-rating-notifications/"
            "00000000-0000-0000-0000-000000000001/read"
        )
        assert response.status_code == 200

    def test_returns_400_when_missing_fields(self, client, sb):
        response = client.post(
            "/api/manual-rating-notifications/send-reminder",
            data=json.dumps({}),
            content_type="application/json",
        )
        assert response.status_code == 400


# ── Org countries ─────────────────────────────────────────────────

class TestGetOrgCountries:

    def test_returns_country_list(self, client, sb):
        _set_sb(sb, returns=_chain([
            {"id": "c1", "name": "Sri Lanka"},
            {"id": "c2", "name": "UAE"},
        ]))
        response = client.get("/api/org/countries")

        assert response.status_code == 200
        body  = json.loads(response.data)
        assert len(body) == 2
        names = [c["name"] for c in body]
        assert names == sorted(names)

    def test_deduplicates_same_country_name(self, client, sb):
        _set_sb(sb, returns=_chain([
            {"id": "c1", "name": "Oman"},
            {"id": "c2", "name": "Oman"},
        ]))
        response = client.get("/api/org/countries")

        body = json.loads(response.data)
        assert len(body) == 1
        assert body[0]["name"] == "Oman"