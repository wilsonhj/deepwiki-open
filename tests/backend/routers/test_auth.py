"""Auth must reject malformed codes with a normal response, never a 500.

`hmac.compare_digest` raises TypeError for `str` arguments that are not pure
ASCII, so a code such as "é" used to crash the request.
"""

import pytest
from fastapi.testclient import TestClient

import api.routers.auth as auth_router
from api import auth
from api.main import app


@pytest.fixture
def auth_on(monkeypatch):
    monkeypatch.setattr(auth, "WIKI_AUTH_MODE", True)
    monkeypatch.setattr(auth, "WIKI_AUTH_CODE", "s3cret")
    monkeypatch.setattr(auth_router, "WIKI_AUTH_MODE", True)
    return TestClient(app, raise_server_exceptions=False)


@pytest.mark.parametrize("code", ["é", "s3creté", "☃"])
def test_validate_non_ascii_code_is_invalid_not_500(auth_on, code):
    resp = auth_on.post("/auth/validate", json={"code": code})
    assert resp.status_code == 200
    assert resp.json() == {"success": False}


def test_validate_correct_code(auth_on):
    resp = auth_on.post("/auth/validate", json={"code": "s3cret"})
    assert resp.json() == {"success": True}


def test_non_ascii_query_code_is_401_not_500(auth_on):
    resp = auth_on.get("/api/processed_projects", params={"authorization_code": "é"})
    assert resp.status_code == 401


def test_non_ascii_configured_code_matches(monkeypatch):
    monkeypatch.setattr(auth, "WIKI_AUTH_MODE", True)
    monkeypatch.setattr(auth, "WIKI_AUTH_CODE", "pässwörd")
    assert auth.auth_code_valid("pässwörd")
    assert not auth.auth_code_valid("passwort")
