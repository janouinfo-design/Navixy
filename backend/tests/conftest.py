"""Fixtures partagées — authentification des tests backend.
Correctif audit : les suites historiques appelaient l'API sans authentification (401).
Le correctif concerne UNIQUEMENT la façon dont les tests s'authentifient
(login super admin réel via /api/auth/login) — aucun contournement production.
"""
import os
from functools import lru_cache

import pytest
import requests
from dotenv import dotenv_values

_frontend_env = dotenv_values("/app/frontend/.env")
_backend_env = dotenv_values("/app/backend/.env")

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or _frontend_env.get("REACT_APP_BACKEND_URL")).rstrip("/")


@lru_cache(maxsize=1)
def super_admin_session() -> requests.Session:
    """Session authentifiée SUPER_ADMIN (tenant default) — cookies HttpOnly portés."""
    s = requests.Session()
    creds = {"email": _backend_env["SUPER_ADMIN_EMAIL"],
             "password": _backend_env["SUPER_ADMIN_PASSWORD"]}
    r = s.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"Login super admin impossible: {r.status_code} {r.text[:200]}"
    return s


@lru_cache(maxsize=4)
def tenant_session(email: str, password: str) -> requests.Session:
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"Login {email} impossible: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="session")
def auth_session():
    return super_admin_session()
