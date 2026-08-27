"""Backend tests for the /api/vehicles/admin router (iteration 13)."""
import io
import os

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")).rstrip("/")
TRACKER_ID = 781479
ROOT = f"{BASE_URL}/api/vehicles/admin"


@pytest.fixture(scope="module")
def client():
    from conftest import super_admin_session
    return super_admin_session()


# ---------- LIST + SECTION UPSERT ----------
class TestListAndSections:
    def test_list_ok(self, client):
        r = client.get(ROOT, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["success"] is True
        assert "records" in j and isinstance(j["records"], dict)

    def test_put_general_upserts_and_persists(self, client):
        payload = {"section": "general", "data": {"marque": "TEST_Audi", "modele": "TEST_A4", "responsable": "TEST_Jean"}}
        r = client.put(f"{ROOT}/{TRACKER_ID}", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        rec = r.json()["record"]
        assert rec["general"]["marque"] == "TEST_Audi"
        assert rec["general"]["responsable"] == "TEST_Jean"
        # verify via list
        rec2 = client.get(ROOT).json()["records"][str(TRACKER_ID)]
        assert rec2["general"]["marque"] == "TEST_Audi"

    def test_put_leasing_and_assurance(self, client):
        for section in ("leasing", "assurance", "carte_grise"):
            r = client.put(f"{ROOT}/{TRACKER_ID}", json={"section": section, "data": {"note": f"TEST_{section}"}}, timeout=15)
            assert r.status_code == 200
            assert r.json()["record"][section]["note"] == f"TEST_{section}"

    def test_invalid_section_400(self, client):
        r = client.put(f"{ROOT}/{TRACKER_ID}", json={"section": "wrong", "data": {}}, timeout=15)
        assert r.status_code == 400


# ---------- CONTROLES ----------
class TestControles:
    def test_controle_full_lifecycle(self, client):
        # Add
        r = client.post(f"{ROOT}/{TRACKER_ID}/controles",
                        json={"label": "TEST_CT", "due_date": "2027-01-15", "notes": "TEST"}, timeout=15)
        assert r.status_code == 200
        controles = r.json()["record"]["controles"]
        target = [c for c in controles if c["label"] == "TEST_CT"][-1]
        cid = target["id"]
        assert isinstance(cid, str) and len(cid) >= 8

        # Update done_date
        r = client.put(f"{ROOT}/{TRACKER_ID}/controles/{cid}", json={"done_date": "2026-08-01"}, timeout=15)
        assert r.status_code == 200
        got = [c for c in r.json()["record"]["controles"] if c["id"] == cid][0]
        assert got["done_date"] == "2026-08-01"

        # Delete
        r = client.delete(f"{ROOT}/{TRACKER_ID}/controles/{cid}", timeout=15)
        assert r.status_code == 200
        assert not any(c["id"] == cid for c in r.json()["record"]["controles"])


# ---------- ETAT DES LIEUX ----------
class TestEtat:
    def test_etat_add_and_delete(self, client):
        r = client.post(f"{ROOT}/{TRACKER_ID}/etat-des-lieux",
                        json={"date": "2026-08-10", "km": 137577, "etat": "Bon", "notes": "TEST"}, timeout=15)
        assert r.status_code == 200
        items = r.json()["record"]["etat_des_lieux"]
        target = [e for e in items if e.get("notes") == "TEST"][-1]
        eid = target["id"]
        assert target["etat"] == "Bon"

        r = client.delete(f"{ROOT}/{TRACKER_ID}/etat-des-lieux/{eid}", timeout=15)
        assert r.status_code == 200
        assert not any(e["id"] == eid for e in r.json()["record"]["etat_des_lieux"])


# ---------- DOCUMENTS ----------
class TestDocuments:
    def test_document_upload_download_delete(self, client):
        content = b"HELLO TEST DOCUMENT CONTENT " * 10
        files = {"file": ("TEST_doc.txt", io.BytesIO(content), "text/plain")}
        r = client.post(f"{ROOT}/{TRACKER_ID}/documents", files=files, data={"category": "TEST_cat"}, timeout=30)
        assert r.status_code == 200, r.text
        docs = r.json()["record"]["documents"]
        target = [d for d in docs if d["filename"] == "TEST_doc.txt"][-1]
        did = target["id"]
        assert target["size"] == len(content)
        assert target["category"] == "TEST_cat"

        # Download
        r = client.get(f"{ROOT}/{TRACKER_ID}/documents/{did}", timeout=30)
        assert r.status_code == 200
        assert r.content == content

        # Delete
        r = client.delete(f"{ROOT}/{TRACKER_ID}/documents/{did}", timeout=15)
        assert r.status_code == 200
        assert not any(d["id"] == did for d in r.json()["record"]["documents"])

        # Verify file removed from disk
        # (files live under /app/backend/uploads/default/{tid}/{did}_filename)
        folder = f"/app/backend/uploads/default/{TRACKER_ID}"
        if os.path.isdir(folder):
            assert not any(f.startswith(did) for f in os.listdir(folder))

    def test_document_too_large_413(self, client):
        # 26 MB content
        big = b"x" * (26 * 1024 * 1024)
        files = {"file": ("TEST_big.bin", io.BytesIO(big), "application/octet-stream")}
        r = client.post(f"{ROOT}/{TRACKER_ID}/documents", files=files, data={"category": "TEST_big"}, timeout=120)
        assert r.status_code == 413, f"expected 413, got {r.status_code}: {r.text[:200]}"


# ---------- FINAL CLEANUP: reset sections + remove test artefacts ----------
class TestZZCleanup:
    def test_reset_sections_and_purge_test_data(self, client):
        for section in ("general", "leasing", "assurance", "carte_grise"):
            r = client.put(f"{ROOT}/{TRACKER_ID}", json={"section": section, "data": {}}, timeout=15)
            assert r.status_code == 200
        # Purge any residual TEST_ controles / etat / docs
        rec = client.get(ROOT).json()["records"].get(str(TRACKER_ID), {})
        for c in rec.get("controles", []):
            if str(c.get("label", "")).startswith("TEST_") or c.get("notes") == "TEST":
                client.delete(f"{ROOT}/{TRACKER_ID}/controles/{c['id']}", timeout=15)
        for e in rec.get("etat_des_lieux", []):
            if e.get("notes") == "TEST":
                client.delete(f"{ROOT}/{TRACKER_ID}/etat-des-lieux/{e['id']}", timeout=15)
        for d in rec.get("documents", []):
            if str(d.get("filename", "")).startswith("TEST_") or str(d.get("category", "")).startswith("TEST_"):
                client.delete(f"{ROOT}/{TRACKER_ID}/documents/{d['id']}", timeout=15)
        # Final check: sections empty
        rec = client.get(ROOT).json()["records"].get(str(TRACKER_ID), {})
        for section in ("general", "leasing", "assurance", "carte_grise"):
            assert rec.get(section, {}) == {}, f"section {section} not reset: {rec.get(section)}"
