"""Tests for Analyse Flotte invariants (iteration 9)."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL",
                          "https://iot-navixy-logic.preview.emergentagent.com").rstrip("/")
TIMEOUT = 90


@pytest.fixture(scope="module")
def api():
    from conftest import super_admin_session
    return super_admin_session()


def _get_eff(api, from_d, to_d):
    r = api.get(f"{BASE_URL}/api/fleet/efficiency",
                params={"from_date": from_d, "to_date": to_d}, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.mark.parametrize("from_d,to_d,expected_days", [
    ("2026-02-01", "2026-02-07", 7),
    ("2026-02-07", "2026-02-07", 1),
    ("2026-01-08", "2026-02-07", 31),
])
def test_efficiency_invariants(api, from_d, to_d, expected_days):
    data = _get_eff(api, from_d, to_d)
    s = data["summary"]
    total = s["total_vehicles"]
    used = s["used_vehicles"]
    inactive = s["inactive_vehicles"]
    cats = s["categories"]

    # (1) used + inactive == total
    assert used + inactive == total, \
        f"used({used})+inactive({inactive}) != total({total})"

    # (2) sum of all categories == total_vehicles
    assert sum(cats.values()) == total, \
        f"cat sum {sum(cats.values())} != total {total}, cats={cats}"

    # (3) sum of non-inactif categories == used_vehicles
    non_inactive_sum = sum(v for k, v in cats.items() if k != "inactif")
    assert non_inactive_sum == used, \
        f"non-inactif sum {non_inactive_sum} != used {used}, cats={cats}"

    # (4) period.days matches expected
    assert data.get("period", {}).get("days") == expected_days, \
        f"days={data.get('period', {}).get('days')} != {expected_days}"


def test_trends_7_days(api):
    r = api.get(f"{BASE_URL}/api/analytics/trends",
                params={"from_date": "2026-02-01", "to_date": "2026-02-07"},
                timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    data = r.json()
    daily = data.get("daily") or data.get("trends") or []
    assert len(daily) == 7, f"expected 7 days, got {len(daily)}"
    for d in daily:
        assert "active_vehicles" in d
        assert ("total_distance" in d) or ("distance" in d)
