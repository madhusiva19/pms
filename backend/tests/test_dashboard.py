import pytest
from unittest.mock import patch, MagicMock
import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from app import app


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


def _table_mock_for_stats(user_row, count_by_table=None):
    """Builds a supabase.table(...) side_effect that returns per-table mocks,
    matching how routes/dashboard_routes.py and dashboard_service.py chain calls."""
    count_by_table = count_by_table or {}

    calls = {"users": 0}

    def table(name):
        m = MagicMock()
        if name == "users":
            calls["users"] += 1
            if calls["users"] == 1:
                # First call: the initial user lookup by id.
                m.select.return_value.eq.return_value.execute.return_value.data = [user_row]
            else:
                # Later calls: org_level-scoped employee counts (single .eq
                # for HQ/org_level 1, double .eq for lower levels).
                m.select.return_value.eq.return_value.execute.return_value.count = \
                    count_by_table.get("users", 0)
                m.select.return_value.eq.return_value.eq.return_value.execute.return_value.count = \
                    count_by_table.get("users", 0)
        else:
            m.select.return_value.execute.return_value.count = count_by_table.get(name, 0)
            m.select.return_value.eq.return_value.execute.return_value.count = count_by_table.get(name, 0)
            m.select.return_value.eq.return_value.execute.return_value.data = []
        return m

    return table


# ── GET /api/dashboard/stats/<employee_id> ──────────────────────────────────

@patch("services.dashboard_service.supabase")
def test_get_dashboard_stats_hq_admin(mock_supabase, client, mock_auth):
    """org_level 1 (HQ) sees counts across countries/branches/employees."""
    mock_supabase.table.side_effect = _table_mock_for_stats(
        {"org_level": 1, "country_id": None, "branch_id": None,
         "department_id": None, "sub_department_id": None},
        count_by_table={"countries": 3, "branches": 12, "users": 900},
    )

    res = client.get("/api/dashboard/stats/hq-emp-1")
    data = res.get_json()

    assert res.status_code == 200
    assert "stats" in data


@patch("services.dashboard_service.supabase")
def test_get_dashboard_stats_user_not_found(mock_supabase, client, mock_auth):
    mock_supabase.table.return_value.select.return_value.eq.return_value\
        .execute.return_value.data = []

    res = client.get("/api/dashboard/stats/missing-emp")
    assert res.status_code == 404


def test_get_dashboard_stats_unauthenticated(client, mock_auth):
    mock_auth.require_auth.return_value = None
    res = client.get("/api/dashboard/stats/emp-123")
    assert res.status_code == 401


def test_get_dashboard_stats_forbidden(client, mock_auth):
    mock_auth.is_authorized_for.return_value = False
    res = client.get("/api/dashboard/stats/someone-elses-id")
    assert res.status_code == 403


# ── GET /api/dashboard/charts/<employee_id> ─────────────────────────────────

@patch("services.dashboard_service.supabase")
def test_get_dashboard_charts_hq_admin(mock_supabase, client, mock_auth):
    def table(name):
        m = MagicMock()
        if name == "users":
            m.select.return_value.eq.return_value.execute.return_value.data = [
                {"org_level": 1, "country_id": None, "branch_id": None, "department_id": None},
            ]
        elif name == "countries":
            m.select.return_value.execute.return_value.data = [
                {"id": "c1", "name": "Sri Lanka", "total_employees": 50},
            ]
        elif name == "performance_scores":
            m.select.return_value.eq.return_value.in_.return_value.execute.return_value.data = []
        return m

    mock_supabase.table.side_effect = table

    res = client.get("/api/dashboard/charts/hq-emp-1")
    data = res.get_json()

    assert res.status_code == 200
    assert data["data"]["bar"][0]["entity_type"] == "country"
    assert data["data"]["bar"][0]["drillable"] is True


@patch("services.dashboard_service.supabase")
def test_get_dashboard_charts_user_not_found(mock_supabase, client, mock_auth):
    mock_supabase.table.return_value.select.return_value.eq.return_value\
        .execute.return_value.data = []

    res = client.get("/api/dashboard/charts/missing-emp")
    assert res.status_code == 404


def test_get_dashboard_charts_unauthenticated(client, mock_auth):
    mock_auth.require_auth.return_value = None
    res = client.get("/api/dashboard/charts/emp-123")
    assert res.status_code == 401


def test_get_dashboard_charts_forbidden(client, mock_auth):
    mock_auth.is_authorized_for.return_value = False
    res = client.get("/api/dashboard/charts/someone-elses-id")
    assert res.status_code == 403


# ── GET /api/dashboard/drilldown ────────────────────────────────────────────

@patch("services.dashboard_service.supabase")
@patch("routes.dashboard_routes.is_authorized_for_org_entity")
def test_get_dashboard_drilldown_success(mock_is_authorized_org, mock_supabase, client, mock_auth):
    mock_is_authorized_org.return_value = True
    mock_supabase.table.return_value.select.return_value.eq.return_value\
        .execute.return_value.data = [
            {"id": "b1", "name": "Colombo Branch", "total_employees": 40},
        ]

    res = client.get("/api/dashboard/drilldown?entity_type=country&entity_id=lk")
    assert res.status_code == 200
    mock_is_authorized_org.assert_called_once_with("caller-uuid-1", "country", "lk")


def test_get_dashboard_drilldown_unauthenticated(client, mock_auth):
    mock_auth.require_auth.return_value = None
    res = client.get("/api/dashboard/drilldown?entity_type=country&entity_id=lk")
    assert res.status_code == 401


@patch("routes.dashboard_routes.is_authorized_for_org_entity")
def test_get_dashboard_drilldown_forbidden_outside_own_scope(mock_is_authorized_org, client, mock_auth):
    """A country-admin trying to drill into a country/branch outside their
    own scope must be rejected, even though they're authenticated."""
    mock_is_authorized_org.return_value = False

    res = client.get("/api/dashboard/drilldown?entity_type=country&entity_id=some-other-country")
    assert res.status_code == 403


@patch("routes.dashboard_routes.is_authorized_for_org_entity")
def test_get_dashboard_drilldown_missing_params_forbidden(mock_is_authorized_org, client, mock_auth):
    """Missing entity_type/entity_id fails the authorization check rather
    than falling through to the service with empty strings."""
    mock_is_authorized_org.return_value = False

    res = client.get("/api/dashboard/drilldown")
    assert res.status_code == 403
