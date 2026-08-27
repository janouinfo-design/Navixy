"""Tests Documents V2 — CRUD, catégories, réconciliation, branchement moteur, isolation.
Données de test : tenant default, tracker orphelin 781479 (pattern des suites existantes),
nettoyage systématique en finally.
"""
import io
import sys
from datetime import date

import requests

sys.path.insert(0, "/app/backend")
from deadline_engine import compute_vehicle_deadlines, SOURCE_DOCUMENT_V2, SOURCE_NAVIXY_GARAGE  # noqa: E402
from conftest import BASE_URL, super_admin_session, tenant_session  # noqa: E402

TODAY = date(2026, 6, 15)
TID = 781479  # fiche orpheline default — véhicule de test historique


# ---------- Unitaires moteur : documents génériques + renouvellement ----------

def test_generic_document_deadline_critical_flag():
    docs = [{"document_id": "g1", "deadline_type": "document", "expiry_date": "2026-06-01",
             "label": "Document : Autorisation OFROU", "critical": True},
            {"document_id": "g2", "deadline_type": "document", "expiry_date": "2026-07-01",
             "label": "Document : Contrat", "critical": False}]
    items = compute_vehicle_deadlines(TID, documents_v2=docs, today=TODAY)
    assert len(items) == 2  # chaque document émis individuellement
    g1 = next(x for x in items if x["source_id"] == "g1")
    g2 = next(x for x in items if x["source_id"] == "g2")
    assert g1["status"] == "EXPIRED" and g1["severity"] == "critical"
    assert g1["label"] == "Document : Autorisation OFROU"
    assert g2["status"] == "DUE_SOON" and g2["severity"] == "warning"


def test_assurance_renewal_takes_latest_expiry():
    docs = [{"document_id": "old", "deadline_type": "assurance", "expiry_date": "2026-01-01"},
            {"document_id": "new", "deadline_type": "assurance", "expiry_date": "2027-01-01"}]
    items = compute_vehicle_deadlines(TID, {}, {"liability_insurance_valid_till": "2026-03-01"},
                                      documents_v2=docs, today=TODAY)
    assur = [x for x in items if x["deadline_type"] == "assurance"]
    assert len(assur) == 1
    assert assur[0]["source"] == SOURCE_DOCUMENT_V2
    assert assur[0]["source_id"] == "new" and assur[0]["due_date"] == "2027-01-01"
    assert assur[0]["status"] == "VALID"


# ---------- API : catégories ----------

def test_categories_defaults(auth_session):
    r = auth_session.get(f"{BASE_URL}/api/documents/categories", timeout=30)
    assert r.status_code == 200, r.text
    cats = {c["id"]: c for c in r.json()["categories"]}
    for cid in ("carte_grise", "assurance_rc", "leasing", "controle", "facture", "autre"):
        assert cid in cats
    assert cats["assurance_rc"]["deadline_type"] == "assurance"
    assert cats["assurance_rc"]["critical_when_overdue"] is True
    assert cats["leasing"]["deadline_type"] == "leasing"
    assert cats["carte_grise"]["deadline_type"] is None  # pas de fausse expiration (CH)
    assert cats["autre"]["deadline_type"] == "document"


def test_category_create_and_delete(auth_session):
    r = auth_session.post(f"{BASE_URL}/api/documents/categories",
                          json={"label": "Vignette test", "deadline_type": "document",
                                "critical_when_overdue": False}, timeout=30)
    assert r.status_code == 200, r.text
    cat_id = r.json()["category"]["id"]
    try:
        # doublon refusé
        r2 = auth_session.post(f"{BASE_URL}/api/documents/categories",
                               json={"label": "vignette test", "deadline_type": None}, timeout=30)
        assert r2.status_code == 409
        # système non supprimable
        r3 = auth_session.delete(f"{BASE_URL}/api/documents/categories/carte_grise", timeout=30)
        assert r3.status_code == 400
    finally:
        r4 = auth_session.delete(f"{BASE_URL}/api/documents/categories/{cat_id}", timeout=30)
        assert r4.status_code == 200


def test_category_invalid_deadline_type(auth_session):
    r = auth_session.post(f"{BASE_URL}/api/documents/categories",
                          json={"label": "X-invalid", "deadline_type": "controle"}, timeout=30)
    assert r.status_code == 400


# ---------- API : CRUD document + branchement moteur ----------

def _upload(session, **fields):
    files = {"file": ("test_doc.txt", io.BytesIO(b"CONTENU TEST DOCUMENTS V2"), "text/plain")}
    return session.post(f"{BASE_URL}/api/documents", files=files, data=fields, timeout=60)


def test_document_crud_deadline_and_engine(auth_session):
    doc_id = None
    try:
        r = _upload(auth_session, category_id="assurance_rc", title="Police RC test",
                    document_number="POL-123", tracker_id=str(TID), expiry_date="2026-01-01")
        assert r.status_code == 200, r.text
        doc = r.json()["document"]
        doc_id = doc["id"]
        assert doc["reconcile_status"] == "linked"
        assert doc["deadline"]["status"] == "EXPIRED"
        assert doc["deadline"]["severity"] == "critical"  # assurance échue = critique (règle 2b)

        # Le moteur flotte voit le document (source DOCUMENT_V2 prioritaire)
        dl = auth_session.get(f"{BASE_URL}/api/vehicles/deadlines", timeout=60).json()
        assur = [x for x in dl["deadlines"] if x["tracker_id"] == TID and x["deadline_type"] == "assurance"]
        assert len(assur) == 1
        assert assur[0]["source"] == SOURCE_DOCUMENT_V2
        assert assur[0]["source_id"] == doc_id

        # PATCH : prolongation → VALID
        r2 = auth_session.patch(f"{BASE_URL}/api/documents/{doc_id}",
                                json={"expiry_date": "2027-12-31"}, timeout=30)
        assert r2.status_code == 200, r2.text
        assert r2.json()["document"]["deadline"]["status"] == "VALID"

        # Téléchargement : contenu intact
        f = auth_session.get(f"{BASE_URL}/api/documents/{doc_id}/file", timeout=30)
        assert f.status_code == 200 and f.content == b"CONTENU TEST DOCUMENTS V2"

        # Liste filtrée par tracker
        lst = auth_session.get(f"{BASE_URL}/api/documents", params={"tracker_id": TID}, timeout=30).json()
        assert any(d["id"] == doc_id for d in lst["documents"])
    finally:
        if doc_id:
            assert auth_session.delete(f"{BASE_URL}/api/documents/{doc_id}", timeout=30).status_code == 200
    # après suppression : plus d'échéance document
    dl = auth_session.get(f"{BASE_URL}/api/vehicles/deadlines", timeout=60).json()
    assert not any(x.get("source_id") == doc_id for x in dl["deadlines"])


def test_document_requires_vehicle_reference(auth_session):
    r = _upload(auth_session, category_id="facture", title="Sans véhicule")
    assert r.status_code == 400


def test_document_invalid_date_rejected(auth_session):
    r = _upload(auth_session, category_id="facture", tracker_id=str(TID), expiry_date="pas-une-date")
    assert r.status_code == 400


def test_document_date_order_rejected(auth_session):
    r = _upload(auth_session, category_id="facture", tracker_id=str(TID),
                valid_from="2027-01-01", expiry_date="2026-01-01")
    assert r.status_code == 400


def test_reconcile_flow(auth_session):
    doc_id = None
    try:
        # rattachement à un véhicule garage NON lié → to_reconcile (jamais de faux véhicule)
        r = _upload(auth_session, category_id="carte_grise", title="CG à réconcilier",
                    navixy_vehicle_id="999123")
        assert r.status_code == 200, r.text
        doc = r.json()["document"]
        doc_id = doc["id"]
        assert doc["reconcile_status"] == "to_reconcile"

        # visible dans le rapport d'intégrité
        integ = auth_session.get(f"{BASE_URL}/api/vehicles/integrity", timeout=90).json()
        assert any(d["id"] == doc_id for d in integ["documents_to_reconcile"])

        # réconciliation sans réimport
        r2 = auth_session.patch(f"{BASE_URL}/api/documents/{doc_id}", json={"tracker_id": TID}, timeout=30)
        assert r2.status_code == 200
        assert r2.json()["document"]["reconcile_status"] == "linked"

        # détacher totalement est refusé
        r3 = auth_session.patch(f"{BASE_URL}/api/documents/{doc_id}",
                                json={"tracker_id": None, "navixy_vehicle_id": None}, timeout=30)
        assert r3.status_code == 400
    finally:
        if doc_id:
            auth_session.delete(f"{BASE_URL}/api/documents/{doc_id}", timeout=30)


# ---------- Isolation multi-tenant + migration legacy ----------

def test_isolation_beta_sees_nothing_from_default(auth_session):
    doc_id = None
    try:
        r = _upload(auth_session, category_id="facture", title="Isolé default", tracker_id=str(TID))
        doc_id = r.json()["document"]["id"]
        beta = tenant_session("admin@test-beta.local", "Beta2026!admin")
        lst = beta.get(f"{BASE_URL}/api/documents", timeout=30)
        assert lst.status_code == 200
        assert not any(d["id"] == doc_id for d in lst.json()["documents"])
        # accès direct au fichier d'un autre tenant → 404
        f = beta.get(f"{BASE_URL}/api/documents/{doc_id}/file", timeout=30)
        assert f.status_code == 404
    finally:
        if doc_id:
            auth_session.delete(f"{BASE_URL}/api/documents/{doc_id}", timeout=30)


def test_legacy_migration_demo_tenant():
    demo = tenant_session("demo@logitrak.ch", "DemoEV2026!")
    lst = demo.get(f"{BASE_URL}/api/documents", timeout=30)
    assert lst.status_code == 200, lst.text
    legacy = [d for d in lst.json()["documents"] if d.get("source") == "legacy"]
    assert len(legacy) >= 2, "documents legacy demo non migrés"
    for d in legacy:
        assert d["reconcile_status"] == "linked"
        assert d["tracker_id"] is not None


def test_unauthenticated_documents_401():
    r = requests.get(f"{BASE_URL}/api/documents", timeout=30)
    assert r.status_code == 401
