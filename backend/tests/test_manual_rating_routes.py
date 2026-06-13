"""
tests/test_manual_rating_routes.py
Run with:  pytest tests/test_manual_rating_routes.py -v
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
    """Cleanly configure sb.table — always clears previous state first."""
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
    from routes.manual_rating_routes import manual_rating_bp
    flask_app = Flask(__name__)
    flask_app.config["TESTING"] = True
    flask_app.register_blueprint(manual_rating_bp)
    return flask_app

@pytest.fixture
def client(app):
    return app.test_client()

@pytest.fixture
def sb():
    import routes.manual_rating_routes as mr
    sb = utils.db.supabase
    mr.supabase = sb
    return sb


# ══════════════════════════════════════════════════════════════════
# GET /api/manual-objectives/<user_id>
# ══════════════════════════════════════════════════════════════════

class TestGetManualObjectives:

    def test_returns_objectives_with_existing_ratings(self, client, sb):
        _set_sb(sb, side_effects=[
            _chain([{"template_id": 1}]),
            _chain([{"id": 10, "name": "Customer Focus"}]),
            _chain([
                {"id": 101, "name": "Monthly Idea Generation",
                 "weight": 3.0, "category_id": 10, "kpi_scale": "manual"},
                {"id": 102, "name": "GP on Personal Sales",
                 "weight": 4.0, "category_id": 10, "kpi_scale": "manual"},
            ]),
            _chain([
                {"objective_id": 101, "manual_rating": 4.0,
                 "rating_comment": "Good ideas"},
                {"objective_id": 102, "manual_rating": None,
                 "rating_comment": None},
            ]),
        ])
        with patch("routes.manual_rating_routes.get_active_period_params",
                   return_value=(2025, "H1")):
            response = client.get("/api/manual-objectives/user-1?year=2025&period=H1")

        assert response.status_code == 200
        body = json.loads(response.data)
        assert len(body) == 2
        obj1 = next(o for o in body if o["objective_id"] == 101)
        assert obj1["manual_rating"]  == 4.0
        assert obj1["rating_comment"] == "Good ideas"
        assert obj1["category_name"]  == "Customer Focus"

    def test_returns_404_when_no_template_assigned(self, client, sb):
        _set_sb(sb, returns=_chain([]))
        with patch("routes.manual_rating_routes.get_active_period_params",
                   return_value=(2025, "H1")):
            response = client.get("/api/manual-objectives/user-no-template")

        assert response.status_code == 404
        assert "error" in json.loads(response.data)

    def test_returns_empty_list_when_no_manual_objectives(self, client, sb):
        _set_sb(sb, side_effects=[
            _chain([{"template_id": 1}]),
            _chain([{"id": 10, "name": "Financial Focus"}]),
            _chain([]),
        ])
        with patch("routes.manual_rating_routes.get_active_period_params",
                   return_value=(2025, "H1")):
            response = client.get("/api/manual-objectives/user-1")

        assert response.status_code == 200
        assert json.loads(response.data) == []

    def test_returns_empty_list_when_no_categories(self, client, sb):
        _set_sb(sb, side_effects=[
            _chain([{"template_id": 1}]),
            _chain([]),
        ])
        with patch("routes.manual_rating_routes.get_active_period_params",
                   return_value=(2025, "H1")):
            response = client.get("/api/manual-objectives/user-1")

        assert response.status_code == 200
        assert json.loads(response.data) == []

    def test_uses_query_param_year_and_period(self, client, sb):
        _set_sb(sb, side_effects=[
            _chain([{"template_id": 2}]),
            _chain([{"id": 20, "name": "Process Focus"}]),
            _chain([{"id": 201, "name": "HOD Evaluation",
                     "weight": 5.0, "category_id": 20, "kpi_scale": "manual"}]),
            _chain([]),
        ])
        with patch("routes.manual_rating_routes.get_active_period_params",
                   return_value=(2025, "H1")):
            response = client.get("/api/manual-objectives/user-1?year=2025&period=H2")

        assert response.status_code == 200
        body = json.loads(response.data)
        assert len(body) == 1
        assert body[0]["objective_name"] == "HOD Evaluation"

    def test_returns_500_on_supabase_error(self, client, sb):
        sb.table.side_effect = Exception("DB connection failed")
        with patch("routes.manual_rating_routes.get_active_period_params",
                   return_value=(2025, "H1")):
            response = client.get("/api/manual-objectives/user-1")

        assert response.status_code == 500

    def test_objective_fields_are_present(self, client, sb):
        _set_sb(sb, side_effects=[
            _chain([{"template_id": 1}]),
            _chain([{"id": 10, "name": "HR Focus"}]),
            _chain([{"id": 101, "name": "360 Feedback",
                     "weight": 5.0, "category_id": 10, "kpi_scale": "manual"}]),
            _chain([]),
        ])
        with patch("routes.manual_rating_routes.get_active_period_params",
                   return_value=(2025, "H1")):
            response = client.get("/api/manual-objectives/user-1")

        body = json.loads(response.data)
        assert len(body) == 1
        for field in ["objective_id","objective_name","category_id",
                      "category_name","weight","kpi_scale",
                      "manual_rating","rating_comment"]:
            assert field in body[0], f"Missing field: {field}"


# ══════════════════════════════════════════════════════════════════
# GET /api/feedback/<user_id>/<year>/<period>
# ══════════════════════════════════════════════════════════════════

class TestGetSupervisorFeedback:

    def test_returns_feedback_with_evaluator(self, client, sb):
        _set_sb(sb, side_effects=[
            _chain([{
                "id": "eval-1", "evaluator_id": "mgr-1",
                "users": {"full_name": "Rajiv Mehta",
                          "designation_id": 1,
                          "designations": {"name": "HQ Administrator"}},
            }]),
            _chain([{"comment": "Excellent performance.", "rating": 5}]),
        ])
        response = client.get("/api/feedback/user-1/2025/H1")

        assert response.status_code == 200
        body = json.loads(response.data)
        assert body["feedback"]                 == "Excellent performance."
        assert body["rating"]                   == 5
        assert body["evaluator"]["name"]        == "Rajiv Mehta"
        assert body["evaluator"]["designation"] == "HQ Administrator"

    def test_returns_none_when_no_evaluation(self, client, sb):
        _set_sb(sb, returns=_chain([]))
        response = client.get("/api/feedback/user-1/2025/H1")

        assert response.status_code == 200
        body = json.loads(response.data)
        assert body["feedback"]  is None
        assert body["evaluator"] is None

    def test_returns_none_feedback_when_no_feedback_row(self, client, sb):
        _set_sb(sb, side_effects=[
            _chain([{"id": "eval-1", "evaluator_id": "mgr-1",
                     "users": {"full_name": "Manager", "designations": None}}]),
            _chain([]),
        ])
        response = client.get("/api/feedback/user-1/2025/H2")

        assert response.status_code == 200
        assert json.loads(response.data)["feedback"] is None

    def test_returns_500_on_error(self, client, sb):
        sb.table.side_effect = Exception("Network error")
        response = client.get("/api/feedback/user-1/2025/H1")

        assert response.status_code == 500

    def test_evaluator_designation_defaults_to_empty_string(self, client, sb):
        _set_sb(sb, side_effects=[
            _chain([{"id": "eval-1", "evaluator_id": "mgr-1",
                     "users": {"full_name": "Some Manager",
                               "designations": None}}]),
            _chain([{"comment": "Good job", "rating": 4}]),
        ])
        response = client.get("/api/feedback/user-1/2025/H1")

        body = json.loads(response.data)
        assert body["evaluator"]["designation"] == ""


# ══════════════════════════════════════════════════════════════════
# GET /api/recommendations/<user_id>/<year>/<period>
# ══════════════════════════════════════════════════════════════════

class TestGetRecommendations:

    def test_returns_recommendations_ordered_by_sort_order(self, client, sb):
        _set_sb(sb, returns=_chain([
            {"insight_text": "Focus on WIP reduction.",
             "insight_type": "recommendation", "sort_order": 1},
            {"insight_text": "GP Margin improving.",
             "insight_type": "recommendation", "sort_order": 2},
        ]))
        response = client.get("/api/recommendations/user-1/2025/H1")

        assert response.status_code == 200
        body = json.loads(response.data)
        assert len(body) == 2
        assert body[0]["insight_text"] == "Focus on WIP reduction."
        assert body[1]["sort_order"]   == 2

    def test_returns_empty_list_when_no_recommendations(self, client, sb):
        _set_sb(sb, returns=_chain([]))
        response = client.get("/api/recommendations/user-1/2025/H2")

        assert response.status_code == 200
        assert json.loads(response.data) == []

    def test_returns_500_on_error(self, client, sb):
        sb.table.side_effect = Exception("Timeout")
        response = client.get("/api/recommendations/user-1/2025/H1")

        assert response.status_code == 500

    def test_recommendation_fields_present(self, client, sb):
        _set_sb(sb, returns=_chain([
            {"insight_text": "Revenue at 104%.",
             "insight_type": "recommendation", "sort_order": 1}
        ]))
        response = client.get("/api/recommendations/user-1/2025/H1")

        body = json.loads(response.data)
        assert len(body) == 1
        for field in ["insight_text", "insight_type", "sort_order"]:
            assert field in body[0]

    def test_different_periods_return_different_data(self, client, sb):
        _set_sb(sb, side_effects=[
            _chain([{"insight_text": "H1 rec",
                     "insight_type": "recommendation", "sort_order": 1}]),
            _chain([{"insight_text": "H2 rec",
                     "insight_type": "recommendation", "sort_order": 1}]),
        ])
        r1 = client.get("/api/recommendations/user-1/2025/H1")
        r2 = client.get("/api/recommendations/user-1/2025/H2")

        assert json.loads(r1.data)[0]["insight_text"] == "H1 rec"
        assert json.loads(r2.data)[0]["insight_text"] == "H2 rec"