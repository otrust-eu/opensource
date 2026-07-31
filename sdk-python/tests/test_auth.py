"""Tests for the issuer-bound OTRUST Auth client."""

import pytest

from otrust import auth
from otrust.result import ok


def test_generate_state_is_random_hex():
    first = auth.generate_state()
    second = auth.generate_state()

    assert len(first) == 32
    assert first != second
    int(first, 16)


def test_login_url_requires_server_challenge():
    result = auth.login_url(
        client_id="test-app",
        redirect_uri="https://app.example/callback",
    )

    assert not result.ok
    assert result.error.code == "server_challenge_required"


@pytest.mark.asyncio
async def test_create_challenge_uses_current_api_contract(monkeypatch):
    captured = {}

    class FakeClient:
        async def post(self, path, body):
            captured["path"] = path
            captured["body"] = body
            return ok({
                "success": True,
                "challengeId": "ch_test",
                "challenge": "a" * 64,
                "loginUrl": "https://www.otrust.eu/auth/login?challenge=ch_test",
                "expiresIn": 300,
            })

    monkeypatch.setattr(auth, "get_client", lambda: FakeClient())
    result = await auth.create_challenge(
        "test-app",
        "https://app.example/callback",
        ["identity"],
        "state-123",
    )

    assert result.ok
    assert result.value.challenge_id == "ch_test"
    assert captured == {
        "path": "/api/v1/auth/challenge",
        "body": {
            "clientId": "test-app",
            "redirectUri": "https://app.example/callback",
            "scope": ["identity"],
            "state": "state-123",
        },
    }


@pytest.mark.asyncio
async def test_prove_requires_credential_ownership_material_before_network(monkeypatch):
    called = False

    class FakeClient:
        async def post(self, path, body):
            nonlocal called
            called = True
            return ok({})

    monkeypatch.setattr(auth, "get_client", lambda: FakeClient())
    result = await auth.prove("ch_test", "id_test")

    assert not result.ok
    assert result.error.code == "validation_error"
    assert called is False


def test_parse_callback_and_verify_state():
    parsed = auth.parse_callback(
        "https://app.example/callback?token=token-123&state=state-456"
    )

    assert parsed == {"token": "token-123", "state": "state-456"}
    assert auth.verify_state("state-456", parsed["state"])
    assert not auth.verify_state("state-456", "different")
