"""Tests for the OTRUST proof service."""

import pytest

from otrust import proof


class TestProofModuleExists:
    """Test proof module exists and has expected functions."""

    def test_proof_has_identity(self):
        """Test that proof module has identity function."""
        assert hasattr(proof, 'identity')
        assert callable(proof.identity)

    def test_proof_has_age(self):
        """Test that proof module has age function."""
        assert hasattr(proof, 'age')
        assert callable(proof.age)

    def test_proof_has_membership(self):
        """Test that proof module has membership function."""
        assert hasattr(proof, 'membership')
        assert callable(proof.membership)

    def test_proof_has_verify(self):
        """Test that proof module has verify function."""
        assert hasattr(proof, 'verify')
        assert callable(proof.verify)

    def test_proof_has_get(self):
        """Test that proof module has get function."""
        assert hasattr(proof, 'get')
        assert callable(proof.get)

    def test_proof_has_browser_submission(self):
        """Test that proof module exposes the safe public-proof submission."""
        assert hasattr(proof, "submit_browser_proof")
        assert callable(proof.submit_browser_proof)


@pytest.mark.asyncio
async def test_identity_and_private_attribute_generation_fail_before_network():
    identity_result = await proof.identity("19900101-1234", "1990-01-01")
    age_result = await proof.age("1990-01-01", 18)
    income_result = await proof.income(50_000, 30_000, 100_000)

    assert not identity_result.ok
    assert identity_result.error.code == "trusted_identity_issuer_required"
    assert not age_result.ok
    assert age_result.error.code == "browser_proof_required"
    assert not income_result.ok
    assert income_result.error.code == "browser_proof_required"


@pytest.mark.asyncio
async def test_submit_browser_proof_uses_public_field_allowlist(monkeypatch):
    captured = {}

    class FakeClient:
        async def post(self, path, body):
            captured["path"] = path
            captured["body"] = body
            from otrust.result import ok

            return ok({"success": True, "proofId": "prf_test"})

    monkeypatch.setattr(proof, "get_client", lambda: FakeClient())
    result = await proof.submit_browser_proof(
        "age",
        {"pi_a": ["1", "2", "1"]},
        ["1", "2026", "7", "23", "18", "42"],
        "42",
    )

    assert result.ok
    assert captured == {
        "path": "/api/proof/submit",
        "body": {
            "proofType": "age",
            "version": "groth16-v3",
            "proof": {"pi_a": ["1", "2", "1"]},
            "publicSignals": ["1", "2026", "7", "23", "18", "42"],
            "commitment": "42",
        },
    }
