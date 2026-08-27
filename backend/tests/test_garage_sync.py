"""
Backend tests for the bidirectional garage sync (iteration_14, adapté phase sécurisation).
Endpoints under /api/vehicles/admin/navixy-garage.

IMPORTANT: The garage is a real client GPS account — any modification MUST be
reverted to its original value at the end of the test.
L'ancien véhicule de test (Audi A3 2018) n'existe plus dans le garage réel :
les tests sélectionnent dynamiquement le premier véhicule lié et restaurent
systématiquement les valeurs d'origine.
"""
import io
import os
import struct
import zlib

import pytest
import requests
from dotenv import dotenv_values

from conftest import super_admin_session

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")).rstrip("/")

_cache = {}


def _garage():
    if "data" not in _cache:
        r = super_admin_session().get(f"{BASE_URL}/api/vehicles/admin/navixy-garage", timeout=60)
        assert r.status_code == 200, r.text
        _cache["data"] = r.json()
    return _cache["data"]


def _pick_linked():
    linked = _garage().get("linked") or {}
    assert linked, "aucun véhicule garage lié — tests garage impossibles"
    tid_s, gv = next(iter(linked.items()))
    return tid_s, gv


def _make_tiny_png() -> bytes:
    """Return a valid 2x2 PNG (blue) as bytes — pure stdlib."""
    def chunk(t, data):
        return (struct.pack(">I", len(data)) + t + data +
                struct.pack(">I", zlib.crc32(t + data) & 0xffffffff))
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", 2, 2, 8, 2, 0, 0, 0)  # 2x2 RGB
    raw = b"\x00" + b"\x00\x00\xff" * 2 + b"\x00" + b"\x00\x00\xff" * 2
    idat = zlib.compress(raw)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


class TestGarageList:
    def test_garage_list_structure(self):
        d = _garage()
        assert d["success"] is True
        assert isinstance(d["linked"], dict) and len(d["linked"]) >= 1
        assert isinstance(d["unlinked"], list)

    def test_linked_vehicle_fields(self):
        tid_s, a = _pick_linked()
        assert isinstance(a["vehicle_id"], int)
        assert a["tracker_id"] == int(tid_s)
        for key in ("label", "model", "reg_number", "vin", "manufacture_year", "color",
                    "liability_insurance_policy_number", "liability_insurance_valid_till",
                    "avatar_file_name", "avatar_url"):
            assert key in a, f"champ garage manquant: {key}"
        if a.get("avatar_file_name"):
            assert a["avatar_url"].startswith("https://api.navixy.com/v2/static/vehicle/avatars/")


class TestGaragePush:
    def test_push_color_and_restore(self):
        tid_s, gv = _pick_linked()
        vid = gv["vehicle_id"]
        original_color = gv.get("color") or ""
        # PUSH test value
        r = super_admin_session().put(
            f"{BASE_URL}/api/vehicles/admin/navixy-garage/{vid}",
            json={"data": {"color": "Test LOGITRAK"}}, timeout=30,
        )
        assert r.status_code == 200, r.text
        assert r.json()["vehicle"]["color"] == "Test LOGITRAK"
        try:
            # Re-GET verifies persistence at real garage
            g = super_admin_session().get(f"{BASE_URL}/api/vehicles/admin/navixy-garage", timeout=60).json()
            assert g["linked"][tid_s]["color"] == "Test LOGITRAK"
        finally:
            # MANDATORY RESTORE
            r2 = super_admin_session().put(
                f"{BASE_URL}/api/vehicles/admin/navixy-garage/{vid}",
                json={"data": {"color": original_color}}, timeout=30,
            )
            assert r2.status_code == 200
            assert (r2.json()["vehicle"]["color"] or "") == original_color

    def test_empty_manufacture_year_does_not_crash(self):
        tid_s, gv = _pick_linked()
        vid = gv["vehicle_id"]
        original_year = gv.get("manufacture_year")
        # empty year should be accepted (nulled) — must not 500
        r = super_admin_session().put(
            f"{BASE_URL}/api/vehicles/admin/navixy-garage/{vid}",
            json={"data": {"manufacture_year": ""}}, timeout=30,
        )
        assert r.status_code == 200, r.text
        # RESTORE to original year
        r2 = super_admin_session().put(
            f"{BASE_URL}/api/vehicles/admin/navixy-garage/{vid}",
            json={"data": {"manufacture_year": original_year if original_year is not None else ""}}, timeout=30,
        )
        assert r2.status_code == 200
        assert r2.json()["vehicle"]["manufacture_year"] == original_year

    def test_unknown_vehicle_id_returns_404(self):
        r = super_admin_session().put(
            f"{BASE_URL}/api/vehicles/admin/navixy-garage/999999",
            json={"data": {"color": "X"}}, timeout=30,
        )
        assert r.status_code == 404, r.text


class TestGaragePhoto:
    def test_upload_photo_skipped_without_dedicated_test_vehicle(self):
        # L'ancien véhicule de test (Audi) n'existe plus : uploader une photo sur un
        # véhicule CLIENT réel serait une modification visible non restaurable.
        pytest.skip("véhicule de test garage absent du parc réel — pas d'upload photo sur un véhicule client")
