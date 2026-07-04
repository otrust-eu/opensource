"""Tests for the OTRUST SDK client."""

import pytest
from otrust import OTrustClient, configure
from otrust.client import get_client, get_config, _config


class TestOTrustClient:
    """Test OTrustClient class."""

    def test_create_client_default(self):
        """Test creating a client with defaults."""
        client = OTrustClient()
        assert client.base_url == "https://otrust.eu"

    def test_client_has_base_url(self):
        """Test that client has base_url property."""
        client = OTrustClient()
        assert hasattr(client, 'base_url')


class TestConfigure:
    """Test configure function."""

    def test_configure_sets_base_url(self):
        """Test that configure sets the base URL."""
        configure(base_url="https://test.otrust.eu")
        config = get_config()
        assert config.base_url == "https://test.otrust.eu"
        # Reset
        configure(base_url="https://otrust.eu")

    def test_configure_sets_timeout(self):
        """Test that configure sets the timeout."""
        configure(timeout=45.0)
        config = get_config()
        assert config.timeout == 45.0
        # Reset
        configure(timeout=30.0)

    def test_configure_sets_retries(self):
        """Test that configure sets retries."""
        configure(retries=5)
        config = get_config()
        assert config.retries == 5
        # Reset
        configure(retries=3)


class TestGetClient:
    """Test get_client function."""

    def test_get_client_returns_client(self):
        """Test that get_client returns a client."""
        client = get_client()
        assert client is not None

    def test_get_client_returns_same_instance(self):
        """Test that get_client returns the same instance."""
        client1 = get_client()
        client2 = get_client()
        assert client1 is client2

