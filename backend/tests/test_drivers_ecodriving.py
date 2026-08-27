"""
Tests for GET /api/drivers/ecodriving — Navixy plugin 46 (native scores).
Live data — no fixture allowed. Fixed period 2026-02-01..2026-02-07.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL',
                         'https://iot-navixy-logic.preview.emergentagent.com').rstrip('/')
TIMEOUT = 120
FROM_D = "2026-02-01"
TO_D = "2026-02-07"


@pytest.fixture(scope="module")
def api():
    from conftest import super_admin_session
    return super_admin_session()


@pytest.fixture(scope="module")
def eco(api):
    r = api.get(f"{BASE_URL}/api/drivers/ecodriving",
                params={"from_date": FROM_D, "to_date": TO_D}, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    return r.json()


# ---- Shape ----
def test_top_level_shape(eco):
    for k in ("success", "period", "summary", "drivers", "unassigned_vehicles",
              "sources", "report_available", "_audit"):
        assert k in eco, f"missing key {k}"
    assert eco["success"] is True
    assert eco["report_available"] is True
    assert isinstance(eco["drivers"], list) and len(eco["drivers"]) >= 1
    assert isinstance(eco["unassigned_vehicles"], list)


# ---- Summary : invariants internes (le parc réel évolue — pas de valeurs figées) ----
def test_summary_counts(eco):
    s = eco["summary"]
    drivers = eco["drivers"]
    assert s["drivers_total"] == len(drivers)
    assert s["drivers_with_vehicle"] == sum(1 for d in drivers if d["has_vehicle"])
    assert s["drivers_with_activity"] == sum(1 for d in drivers if d["has_activity"])
    active = [d for d in drivers if d["has_activity"]]
    assert s["total_trips"] == sum(d["trips_count"] or 0 for d in active)
    if s["avg_score"] is not None:
        assert 0 <= s["avg_score"] <= 100
    # penalties_per_100km invariant: total_penalties/total_km*100
    if s.get("total_distance_km") and s.get("penalties_per_100km") is not None:
        expected = round(s["total_penalties"] / s["total_distance_km"] * 100, 2)
        assert abs(expected - s["penalties_per_100km"]) < 0.05


# ---- Drivers without vehicle: fully null ----
def test_drivers_without_vehicle_are_null(eco):
    without = [d for d in eco["drivers"] if not d["has_vehicle"]]
    for d in without:
        assert d["tracker_id"] is None
        assert d["vehicle_label"] is None
        assert d["has_activity"] is False
        for key in ("score", "distance_km", "trips_count", "driving_time_sec",
                    "penalties", "events", "daily", "recent_events"):
            assert d[key] is None, f"{d['driver_name']}.{key} should be null"


# ---- Conducteur avec activité : payload complet ----
def test_active_driver_full_payload(eco):
    active = next((d for d in eco["drivers"] if d["has_activity"] and d.get("score")), None)
    if active is None:
        pytest.skip("aucun conducteur avec activité/score sur la période — parc réel sans attribution")
    assert active["has_vehicle"]
    assert isinstance(active["tracker_id"], int)
    assert active["distance_km"] > 0
    assert active["trips_count"] > 0

    # score native display with stars + number
    disp = active["score"]["display"]
    assert "★" in disp
    assert "(" in disp and ")" in disp
    assert 0 <= active["score"]["raw"] <= 100

    # daily = au plus la longueur de la période (7 jours)
    assert 1 <= len(active["daily"]) <= 7

    # recent_events with required fields
    for ev0 in active["recent_events"][:1]:
        for k in ("ts", "day", "time", "address", "lat", "lng", "penalty", "kind"):
            assert k in ev0, f"recent_events missing {k}"

    # events counters
    events = active["events"]
    for kind in ("braking", "acceleration", "turning", "speeding", "idling"):
        assert kind in events

    # invariant per_100km = count/distance_km*100 for the 4 non-idling kinds
    for kind in ("braking", "acceleration", "turning", "speeding"):
        cnt = events[kind]["count"]
        p100 = events[kind]["per_100km"]
        expected = round(cnt / active["distance_km"] * 100, 2)
        assert abs(expected - p100) < 0.05, f"{kind}: got {p100}, expected {expected}"

    # penalties block
    pen = active["penalties"]
    for k in ("total", "count", "avg"):
        assert k in pen


def test_assigned_drivers_consistency(eco):
    for d in eco["drivers"]:
        if d["has_vehicle"]:
            assert isinstance(d["tracker_id"], int)
            assert d["vehicle_label"]


# ---- Unassigned vehicles: NOT attributed to any driver ----
def test_unassigned_vehicles_isolated(eco):
    assigned_tids = {d["tracker_id"] for d in eco["drivers"] if d["has_vehicle"]}
    for u in eco["unassigned_vehicles"]:
        assert u["tracker_id"] not in assigned_tids, \
            f"véhicule {u['tracker_id']} à la fois attribué et non attribué"
        assert "score" in u
        assert "distance_km" in u
        assert "penalties_count" in u
        if u["score"]:
            assert "★" in u["score"]["display"]


# ---- Audit + cache ----
def test_audit_shape(eco):
    a = eco["_audit"]
    assert a["engine_version"] == "1.0.0"
    assert "navixy_calls" in a and len(a["navixy_calls"]) > 0
    endpoints = {c["endpoint"] for c in a["navixy_calls"]}
    # Must include Navixy plugin-46 calls
    for ep in ("report/tracker/generate", "report/tracker/retrieve", "track/list"):
        assert ep in endpoints, f"expected {ep} in audit navixy_calls"


def test_cache_hit_on_second_call(api):
    # First: prime (may be cache miss)
    api.get(f"{BASE_URL}/api/drivers/ecodriving",
            params={"from_date": FROM_D, "to_date": TO_D}, timeout=TIMEOUT)
    # Second call must be fast + cache hit
    t0 = time.time()
    r = api.get(f"{BASE_URL}/api/drivers/ecodriving",
                params={"from_date": FROM_D, "to_date": TO_D}, timeout=TIMEOUT)
    dt = time.time() - t0
    assert r.status_code == 200
    data = r.json()
    assert data["_audit"]["cache"]["hit"] is True
    assert dt < 3.0, f"cache hit call took {dt:.1f}s (>3s)"


def test_sources_footer(eco):
    srcs = eco["sources"]
    assert isinstance(srcs, list) and len(srcs) >= 3
    joined = " ".join(s.get("source", "") for s in srcs)
    assert "plugin 46" in joined.lower() or "plugin46" in joined.lower()
