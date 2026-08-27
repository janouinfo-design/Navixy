"""Tests du moteur d'échéances unique + régression C1 (assurance RC garage Navixy).
Unitaires : logique pure deadline_engine (aucun réseau).
API : GET /api/vehicles/deadlines (auth réelle via conftest), isolation multi-tenant,
      régression C1 en conditions réelles (écriture garage restaurée en finally).
"""
import sys
from datetime import date

import requests

sys.path.insert(0, "/app/backend")
from deadline_engine import (  # noqa: E402
    compute_vehicle_deadlines, compute_fleet_deadlines,
    SOURCE_DOCUMENT_V2, SOURCE_NAVIXY_GARAGE, SOURCE_VEHICLE_LEGACY,
    STATUS_EXPIRED, STATUS_DUE_SOON, STATUS_VALID, DUE_SOON_DAYS, ENGINE_VERSION,
)
from conftest import BASE_URL, super_admin_session, tenant_session  # noqa: E402

TODAY = date(2026, 6, 15)
TID = 999999


def _one(items, dtype):
    got = [x for x in items if x["deadline_type"] == dtype]
    assert len(got) == 1, f"{dtype}: attendu 1, obtenu {len(got)}"
    return got[0]


# ---------- Unitaires : statuts / null ≠ 0 ----------

def test_no_dates_emits_nothing():
    assert compute_vehicle_deadlines(TID, {}, {}, today=TODAY) == []
    assert compute_vehicle_deadlines(TID, None, None, today=TODAY) == []


def test_invalid_or_empty_dates_emit_nothing():
    rec = {"assurance": {"date_fin": "pas-une-date"}, "leasing": {"date_fin": ""},
           "general": {"prochaine_maintenance": None}}
    assert compute_vehicle_deadlines(TID, rec, {"liability_insurance_valid_till": "n/a"}, today=TODAY) == []


def test_valid_status():
    rec = {"assurance": {"date_fin": "2026-09-15"}}
    it = _one(compute_vehicle_deadlines(TID, rec, today=TODAY), "assurance")
    assert it["status"] == STATUS_VALID and it["severity"] == "info"
    assert it["days_remaining"] == 92 and it["due_date"] == "2026-09-15"


def test_due_soon_status():
    rec = {"leasing": {"date_fin": "2026-07-01"}}
    it = _one(compute_vehicle_deadlines(TID, rec, today=TODAY), "leasing")
    assert it["status"] == STATUS_DUE_SOON and it["severity"] == "warning"
    assert it["days_remaining"] == 16


def test_boundary_30_days_is_valid():
    rec = {"leasing": {"date_fin": (date(2026, 7, 15)).isoformat()}}  # J+30 exact
    it = _one(compute_vehicle_deadlines(TID, rec, today=TODAY), "leasing")
    assert it["days_remaining"] == DUE_SOON_DAYS and it["status"] == STATUS_VALID


def test_expired_assurance_is_critical():
    rec = {"assurance": {"date_fin": "2026-06-01"}}
    it = _one(compute_vehicle_deadlines(TID, rec, today=TODAY), "assurance")
    assert it["status"] == STATUS_EXPIRED and it["severity"] == "critical"
    assert it["critical_when_overdue"] is True and it["days_remaining"] == -14


def test_expired_leasing_is_not_critical():
    rec = {"leasing": {"date_fin": "2026-06-01"}}
    it = _one(compute_vehicle_deadlines(TID, rec, today=TODAY), "leasing")
    assert it["status"] == STATUS_EXPIRED and it["severity"] == "warning"
    assert it["critical_when_overdue"] is False


# ---------- Unitaires : précédence dual-read ----------

def test_c1_regression_garage_only_expired():
    """RÉGRESSION C1 : RC garage Navixy échue, aucune autre source → EXPIRED critical,
    source NAVIXY_GARAGE traçable."""
    gv = {"liability_insurance_valid_till": "2026-05-01"}
    it = _one(compute_vehicle_deadlines(TID, {}, gv, today=TODAY), "assurance")
    assert it["status"] == STATUS_EXPIRED
    assert it["severity"] == "critical"
    assert it["source"] == SOURCE_NAVIXY_GARAGE
    assert it["source_field"] == "liability_insurance_valid_till"


def test_precedence_garage_over_legacy():
    gv = {"liability_insurance_valid_till": "2026-12-01"}
    rec = {"assurance": {"date_fin": "2026-07-01"}}
    it = _one(compute_vehicle_deadlines(TID, rec, gv, today=TODAY), "assurance")
    assert it["source"] == SOURCE_NAVIXY_GARAGE and it["due_date"] == "2026-12-01"


def test_legacy_fallback_when_garage_empty_or_invalid():
    for bad in (None, "", "invalid"):
        gv = {"liability_insurance_valid_till": bad}
        rec = {"assurance": {"date_fin": "2026-07-01"}}
        it = _one(compute_vehicle_deadlines(TID, rec, gv, today=TODAY), "assurance")
        assert it["source"] == SOURCE_VEHICLE_LEGACY and it["source_field"] == "assurance.date_fin"


def test_precedence_document_v2_first():
    docs = [{"document_id": "doc-1", "deadline_type": "assurance", "expiry_date": "2027-01-01"}]
    gv = {"liability_insurance_valid_till": "2026-12-01"}
    rec = {"assurance": {"date_fin": "2026-07-01"}}
    it = _one(compute_vehicle_deadlines(TID, rec, gv, documents_v2=docs, today=TODAY), "assurance")
    assert it["source"] == SOURCE_DOCUMENT_V2 and it["source_id"] == "doc-1"
    assert it["due_date"] == "2027-01-01"


def test_document_v2_without_expiry_falls_back():
    docs = [{"document_id": "doc-2", "deadline_type": "assurance", "expiry_date": None}]
    gv = {"liability_insurance_valid_till": "2026-12-01"}
    it = _one(compute_vehicle_deadlines(TID, {}, gv, documents_v2=docs, today=TODAY), "assurance")
    assert it["source"] == SOURCE_NAVIXY_GARAGE


# ---------- Unitaires : contrôles / maintenance ----------

def test_controles_done_excluded_and_open_emitted():
    rec = {"controles": [
        {"id": "a", "label": "CT", "due_date": "2026-06-20", "done_date": None},
        {"id": "b", "label": "Service", "due_date": "2026-06-01", "done_date": "2026-06-02"},
        {"id": "c", "label": "Expertise", "due_date": "2026-05-01"},
    ]}
    items = compute_vehicle_deadlines(TID, rec, today=TODAY)
    ctrl = [x for x in items if x["deadline_type"] == "controle"]
    assert {x["source_id"] for x in ctrl} == {"a", "c"}
    expired = [x for x in ctrl if x["source_id"] == "c"][0]
    assert expired["status"] == STATUS_EXPIRED and expired["severity"] == "critical"
    assert ctrl[0]["label"].startswith("Contrôle : ")


def test_maintenance_and_expertise():
    rec = {"general": {"prochaine_maintenance": "2026-06-25", "prochaine_expertise": "2026-05-30"}}
    items = compute_vehicle_deadlines(TID, rec, today=TODAY)
    m = _one(items, "maintenance")
    e = _one(items, "expertise")
    assert m["status"] == STATUS_DUE_SOON
    assert e["status"] == STATUS_EXPIRED and e["severity"] == "warning"  # non critique (règle 2b)
    assert m["source"] == SOURCE_VEHICLE_LEGACY


def test_fleet_merges_admin_and_garage_populations():
    admin = {"111": {"leasing": {"date_fin": "2026-07-01"}}}
    garage = {222: {"liability_insurance_valid_till": "2026-05-01"}}
    items = compute_fleet_deadlines(admin, garage, today=TODAY)
    assert {x["tracker_id"] for x in items} == {111, 222}


# ---------- API : endpoint /api/vehicles/deadlines ----------

REQUIRED_KEYS = {"tracker_id", "deadline_type", "label", "due_date", "days_remaining",
                 "status", "severity", "critical_when_overdue", "source", "source_field", "source_id"}


def test_endpoint_requires_auth():
    r = requests.get(f"{BASE_URL}/api/vehicles/deadlines", timeout=30)
    assert r.status_code == 401


def test_endpoint_shape(auth_session):
    r = auth_session.get(f"{BASE_URL}/api/vehicles/deadlines", timeout=60)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["success"] is True
    assert j["engine_version"] == ENGINE_VERSION
    assert j["thresholds"]["due_soon_days"] == DUE_SOON_DAYS
    assert isinstance(j["garage_available"], bool)
    assert isinstance(j["deadlines"], list)
    for it in j["deadlines"]:
        assert REQUIRED_KEYS <= set(it.keys())
        assert it["status"] in (STATUS_EXPIRED, STATUS_DUE_SOON, STATUS_VALID)
        assert it["due_date"] is not None  # jamais d'échéance sans date


def test_endpoint_c1_live_garage_write_and_restore(auth_session):
    """RÉGRESSION C1 en conditions réelles : RC échue posée dans le garage Navixy
    (premier véhicule garage lié du tenant, restauré en finally) → visible via le moteur unique."""
    garage = auth_session.get(f"{BASE_URL}/api/vehicles/admin/navixy-garage", timeout=60).json()
    linked = garage.get("linked") or {}
    assert linked, "aucun véhicule garage lié — test impossible"
    tid_s, gv = next(iter(linked.items()))
    tid, vid = int(tid_s), gv["vehicle_id"]
    orig_val = gv.get("liability_insurance_valid_till") or ""
    root = f"{BASE_URL}/api/vehicles/admin/navixy-garage/{vid}"
    try:
        r = auth_session.put(root, json={"data": {"liability_insurance_valid_till": "2026-01-31"}}, timeout=60)
        assert r.status_code == 200, r.text
        dl = auth_session.get(f"{BASE_URL}/api/vehicles/deadlines", timeout=60).json()
        assur = [x for x in dl["deadlines"]
                 if x["tracker_id"] == tid and x["deadline_type"] == "assurance"]
        assert len(assur) == 1, f"assurance non détectée: {assur}"
        it = assur[0]
        assert it["status"] == STATUS_EXPIRED
        assert it["severity"] == "critical"
        assert it["source"] == SOURCE_NAVIXY_GARAGE
        assert it["due_date"] == "2026-01-31"
    finally:
        auth_session.put(root, json={"data": {"liability_insurance_valid_till": orig_val}}, timeout=60)


def test_multi_tenant_isolation():
    """test-beta (hash Navixy factice) : garage indisponible, aucune échéance du tenant default."""
    s = tenant_session("admin@test-beta.local", "Beta2026!admin")
    r = s.get(f"{BASE_URL}/api/vehicles/deadlines", timeout=60)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["success"] is True
    assert j["garage_available"] is False
    assert all(x["tracker_id"] != 781479 for x in j["deadlines"]), "fuite tenant default → test-beta"


def test_integrity_endpoint(auth_session):
    r = auth_session.get(f"{BASE_URL}/api/vehicles/integrity", timeout=90)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["success"] is True
    assert "identity_strategy" in j and j["no_auto_merge"] is True
    for k in ("trackers_total", "garage_linked", "garage_unlinked", "trackers_without_garage",
              "orphan_admin_records", "duplicate_plates", "vin_conflicts", "ambiguous_tracker_links"):
        assert k in j, f"clé manquante: {k}"
