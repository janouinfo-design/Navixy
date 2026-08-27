"""Tests for iteration 12: /api/groups endpoint + group_id on vehicles."""
import os
import requests

from conftest import super_admin_session

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://iot-navixy-logic.preview.emergentagent.com",
).rstrip("/")
TIMEOUT = 60


def test_groups_endpoint():
    r = super_admin_session().get(f"{BASE_URL}/api/groups", timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("success") is True
    groups = data.get("groups")
    assert isinstance(groups, list) and len(groups) > 0
    for g in groups:
        assert set(g.keys()) >= {"id", "title"}
        assert isinstance(g["id"], int)
        assert isinstance(g["title"], str) and g["title"]
    # LOGITRAK group titles are live client data — only structural invariants here
    titles = [g["title"] for g in groups]
    assert all(t.strip() for t in titles)


def test_efficiency_vehicles_have_group_id():
    r = super_admin_session().get(
        f"{BASE_URL}/api/fleet/efficiency",
        params={"from_date": "2026-02-01", "to_date": "2026-02-07"},
        timeout=TIMEOUT,
    )
    assert r.status_code == 200, r.text
    vehicles = r.json().get("vehicles", [])
    assert len(vehicles) > 0
    for v in vehicles:
        assert "group_id" in v, f"missing group_id in {v.get('tracker_id')}"
        assert isinstance(v["group_id"], int)


def test_group_ids_are_valid_navixy_groups():
    """Every group_id on vehicles must exist in /api/groups."""
    g = super_admin_session().get(f"{BASE_URL}/api/groups", timeout=TIMEOUT).json()
    valid_ids = {gr["id"] for gr in g["groups"]} | {0}
    v = super_admin_session().get(
        f"{BASE_URL}/api/fleet/efficiency",
        params={"from_date": "2026-02-01", "to_date": "2026-02-07"},
        timeout=TIMEOUT,
    ).json()
    for veh in v["vehicles"]:
        assert veh["group_id"] in valid_ids, f"unknown group_id {veh['group_id']}"
