"""Tests for the OTRUST sign service."""

import pytest
from otrust import sign


class TestSignModuleExists:
    """Test sign module exists and has expected functions."""

    def test_sign_has_status(self):
        """Test that sign module has status function."""
        assert hasattr(sign, 'status')
        assert callable(sign.status)

    def test_sign_has_remind(self):
        """Test that sign module has remind function."""
        assert hasattr(sign, 'remind')
        assert callable(sign.remind)

    def test_sign_has_create(self):
        """Test that sign module has create function."""
        assert hasattr(sign, 'create')
        assert callable(sign.create)
