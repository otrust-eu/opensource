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
