"""
tests/test_performance_routes.py
Run with:  pytest tests/test_performance_routes.py -v
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
    from routes.performance import performance_bp
    flask_app = Flask(__name__)
    flask_app.config["TESTING"] = True
    flask_app.register_blueprint(performance_bp)
    return flask_app

@pytest.fixture
def client(app):
    return app.test_client()

@pytest.fixture
def sb():
    import routes.performance as rp
    sb = utils.db.supabase
    rp.supabase = sb
    return sb


FAKE_SCALE_META = ({}, {}, {}, {})

_FAKE_USER = {
    "id":            "user-1",
    "full_name":     "Rajiv Mehta",
    "designation_id": 1,
    "department_id": "dept-1",
    "designations":  {"name": "HQ Administrator"},
    "departments":   {"name": "Operations"},
}

_FAKE_RECORDS = [{
    "objective_id":   101,
    "target":         100.0,
    "actual":         104.0,
    "manual_rating":  None,
    "rating_comment": None,
    "rating":         3.8,
    "score":          0.38,
    "status":         "approved",
}]


# ══════════════════════════════════════════════════════════════════
# GET /api/performance/<user_id>/periods
# ══════════════════════════════════════════════════════════════════

class TestGetPeriods:

    def test_returns_unique_sorted_periods(self, client, sb):
        _set_sb(sb, returns=_chain([
            {"pms_year": 2025, "period": "H2"},
            {"pms_year": 2025, "period": "H1"},
            {"pms_year": 2025, "period": "H1"},
            {"pms_year": 2024, "period": "H2"},
        ]))
        response = client.get("/api/performance/user-1/periods")

        assert response.status_code == 200
        body = json.loads(response.data)
        assert len(body) == 3
        assert body[0] == {"pms_year": 2024, "period": "H2"}
        assert body[1] == {"pms_year": 2025, "period": "H1"}
        assert body[2] == {"pms_year": 2025, "period": "H2"}

    def test_returns_empty_list_when_no_records(self, client, sb):
        _set_sb(sb, returns=_chain([]))
        response = client.get("/api/performance/user-1/periods")

        assert response.status_code == 200
        assert json.loads(response.data) == []

    def test_returns_500_on_error(self, client, sb):
        sb.table.side_effect = Exception("DB error")
        response = client.get("/api/performance/user-1/periods")

        assert response.status_code == 500


# ══════════════════════════════════════════════════════════════════
# GET /api/performance/<user_id>/<year>/<period>
# ══════════════════════════════════════════════════════════════════

class TestGetPerformance:

    def test_returns_full_performance_breakdown(self, client, sb):
        _set_sb(sb, side_effects=[
            _chain(_FAKE_USER),
            _chain(_FAKE_RECORDS),
        ])
        with patch("routes.performance.load_scale_meta",
                   return_value=FAKE_SCALE_META):
            response = client.get("/api/performance/user-1/2025/H1")

        assert response.status_code == 200
        body = json.loads(response.data)
        assert body["employee"]["name"] == "Rajiv Mehta"
        assert body["period"]           == "H1"
        assert body["pms_year"]             == 2025
        assert "final_score" in body
        assert "categories"  in body

    def test_returns_404_when_user_not_found(self, client, sb):
        result      = MagicMock()
        result.data = None
        chain       = MagicMock()
        chain.execute.return_value = result
        for m in ("select","eq","single"):
            getattr(chain, m).return_value = chain
        _set_sb(sb, returns=chain)
        with patch("routes.performance.load_scale_meta",
                   return_value=FAKE_SCALE_META):
            response = client.get("/api/performance/no-user/2025/H1")

        assert response.status_code == 404

    def test_returns_404_when_no_records(self, client, sb):
        _set_sb(sb, side_effects=[
            _chain(_FAKE_USER),
            _chain([]),
        ])
        with patch("routes.performance.load_scale_meta",
                   return_value=FAKE_SCALE_META):
            response = client.get("/api/performance/user-1/2025/H1")

        assert response.status_code == 404

    def test_employee_fields_present(self, client, sb):
        _set_sb(sb, side_effects=[
            _chain(_FAKE_USER),
            _chain(_FAKE_RECORDS),
        ])
        with patch("routes.performance.load_scale_meta",
                   return_value=FAKE_SCALE_META):
            response = client.get("/api/performance/user-1/2025/H1")

        body = json.loads(response.data)
        for field in ["id","name","designation","department"]:
            assert field in body["employee"]

    def test_returns_500_on_error(self, client, sb):
        sb.table.side_effect = Exception("Timeout")
        with patch("routes.performance.load_scale_meta",
                   return_value=FAKE_SCALE_META):
            response = client.get("/api/performance/user-1/2025/H1")

        assert response.status_code == 500


# ══════════════════════════════════════════════════════════════════
# GET /api/performance/<user_id>/summary
# ══════════════════════════════════════════════════════════════════

class TestGetPerformanceSummary:

    def test_returns_aggregated_scores_by_period(self, client, sb):
        _set_sb(sb, returns=_chain([
            {"period": "H1", "score": 1.2},
            {"period": "H1", "score": 0.8},
            {"period": "H2", "score": 2.1},
        ]))
        with patch("routes.performance.get_active_period_params",
                   return_value=(2025, "H1")):
            response = client.get("/api/performance/user-1/summary?year=2025")

        assert response.status_code == 200
        body = json.loads(response.data)
        assert body["pms_year"]         == 2025
        assert body["scores"]["H1"] == 2.0
        assert body["scores"]["H2"] == 2.1

    def test_returns_empty_scores_when_no_records(self, client, sb):
        _set_sb(sb, returns=_chain([]))
        with patch("routes.performance.get_active_period_params",
                   return_value=(2025, "H1")):
            response = client.get("/api/performance/user-1/summary")

        assert response.status_code == 200
        assert json.loads(response.data)["scores"] == {}

    def test_uses_active_year_when_no_param(self, client, sb):
        _set_sb(sb, returns=_chain([]))
        with patch("routes.performance.get_active_period_params",
                   return_value=(2025, "H1")):
            response = client.get("/api/performance/user-1/summary")

        assert json.loads(response.data)["pms_year"] == 2025

    def test_handles_null_score_gracefully(self, client, sb):
        _set_sb(sb, returns=_chain([
            {"period": "H1", "score": None},
            {"period": "H1", "score": 1.5},
        ]))
        with patch("routes.performance.get_active_period_params",
                   return_value=(2025, "H1")):
            response = client.get("/api/performance/user-1/summary?year=2025")

        assert json.loads(response.data)["scores"]["H1"] == 1.5


# ══════════════════════════════════════════════════════════════════
# POST /api/sync/actuals
# ══════════════════════════════════════════════════════════════════

class TestSyncActuals:

    def test_returns_400_when_missing_required_fields(self, client, sb):
        payload = {"user_id": "user-1", "pms_year": 2025}
        response = client.post(
            "/api/sync/actuals",
            data=json.dumps(payload),
            content_type="application/json",
        )
        assert response.status_code == 400

    def test_syncs_non_manual_records_successfully(self, client, sb):
        _set_sb(sb, returns=_chain([]))
        payload = {
            "user_id": "user-1", "pms_year": 2025, "period": "H1",
            "records": [{"objective_id": 1, "target": 100.0, "actual": 105.0}],
        }
        fake_meta = (
            {1: {"id": 10, "scale_type": "interpolated",
                 "input_type": "achievement_pct",
                 "ll": 90.0, "ul": 110.0, "inverse": False}},
            {}, {1: {"weight": 10.0, "category_id": 1}}, {},
        )
        with patch("routes.performance.load_scale_meta", return_value=fake_meta), \
             patch("routes.performance.patch_total_score", return_value=3.5):
            response = client.post(
                "/api/sync/actuals",
                data=json.dumps(payload),
                content_type="application/json",
            )

        assert response.status_code == 200
        body = json.loads(response.data)
        assert body["success"]     is True
        assert body["synced"]      == 1
        assert body["total_score"] == 3.5

    def test_skips_manual_kpi_records(self, client, sb):
        _set_sb(sb, returns=_chain([]))
        payload = {
            "user_id": "user-1", "pms_year": 2025, "period": "H1",
            "records": [{"objective_id": 99, "target": None, "actual": None}],
        }
        fake_meta = (
            {99: {"id": 20, "scale_type": "manual"}},
            {}, {99: {"weight": 5.0}}, {},
        )
        with patch("routes.performance.load_scale_meta", return_value=fake_meta), \
             patch("routes.performance.patch_total_score", return_value=0.0):
            response = client.post(
                "/api/sync/actuals",
                data=json.dumps(payload),
                content_type="application/json",
            )

        assert response.status_code == 200
        assert json.loads(response.data)["synced"] == 0

    def test_returns_500_on_error(self, client, sb):
        sb.table.side_effect = Exception("Unexpected error")
        payload = {
            "user_id": "user-1", "pms_year": 2025, "period": "H1",
            "records": [{"objective_id": 1}],
        }
        with patch("routes.performance.load_scale_meta",
                   return_value=FAKE_SCALE_META):
            response = client.post(
                "/api/sync/actuals",
                data=json.dumps(payload),
                content_type="application/json",
            )

        assert response.status_code == 500


# ══════════════════════════════════════════════════════════════════
# POST /api/admin/backfill-scores
# ══════════════════════════════════════════════════════════════════

class TestBackfillScores:

    def test_backfill_updates_all_records(self, client, sb):
        _set_sb(sb, returns=_chain([
            {"id": 1, "user_id": "u1", "objective_id": 101,
             "pms_year": 2025, "period": "H1",
             "actual": 105.0, "target": 100.0, "manual_rating": None},
            {"id": 2, "user_id": "u1", "objective_id": 102,
             "pms_year": 2025, "period": "H1",
             "actual": None, "target": None, "manual_rating": 4.0},
        ]))
        fake_meta = (
            {101: {"id": 10, "scale_type": "interpolated",
                   "input_type": "achievement_pct",
                   "ll": 90.0, "ul": 110.0, "inverse": False},
             102: {"id": 11, "scale_type": "manual"}},
            {},
            {101: {"weight": 10.0, "category_id": 1},
             102: {"weight": 5.0,  "category_id": 1}},
            {},
        )
        with patch("routes.performance.load_scale_meta", return_value=fake_meta), \
             patch("routes.performance.patch_total_score", return_value=2.5):
            response = client.post("/api/admin/backfill-scores")

        assert response.status_code == 200
        body = json.loads(response.data)
        assert body["success"]         is True
        assert body["records_updated"] == 2

    def test_backfill_returns_zero_when_no_records(self, client, sb):
        _set_sb(sb, returns=_chain([]))
        with patch("routes.performance.load_scale_meta",
                   return_value=FAKE_SCALE_META), \
             patch("routes.performance.patch_total_score", return_value=0.0):
            response = client.post("/api/admin/backfill-scores")

        body = json.loads(response.data)
        assert body["records_updated"]  == 0
        assert body["batches_totalled"] == 0

    def test_backfill_returns_500_on_error(self, client, sb):
        with patch("routes.performance.load_scale_meta",
                   side_effect=Exception("Connection lost")):
            response = client.post("/api/admin/backfill-scores")

        assert response.status_code == 500