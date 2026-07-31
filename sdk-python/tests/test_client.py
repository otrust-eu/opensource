"""Tests for the OTRUST SDK client."""

import httpx
import pytest

from otrust import OTrustClient, configure
from otrust.client import ClientConfig, get_client, get_config


class TestOTrustClient:
    """Test OTrustClient class."""

    def test_create_client_default(self):
        """Test creating a client with defaults."""
        client = OTrustClient()
        assert client.base_url == "https://www.otrust.eu"

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
        configure(base_url="https://www.otrust.eu")

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


@pytest.mark.asyncio
async def test_post_reuses_automatic_idempotency_key_across_retries():
    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if len(requests) == 1:
            return httpx.Response(503, json={"error": "server_error"})
        return httpx.Response(200, json={"ok": True})

    client = OTrustClient(ClientConfig(retries=2, retry_delay=0))
    client._client = httpx.AsyncClient(
        base_url=client.base_url,
        transport=httpx.MockTransport(handler),
    )

    result = await client.post("/claim/simple", {"hash": "a" * 64})
    await client.close()

    assert result.ok
    assert len(requests) == 2
    first_key = requests[0].headers["Idempotency-Key"]
    assert first_key.startswith("sdk_")
    assert requests[1].headers["Idempotency-Key"] == first_key


@pytest.mark.asyncio
async def test_post_preserves_explicit_idempotency_key():
    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"ok": True})

    client = OTrustClient(ClientConfig(retries=1))
    client._client = httpx.AsyncClient(
        base_url=client.base_url,
        transport=httpx.MockTransport(handler),
    )

    await client.post(
        "/claim/simple",
        {"hash": "a" * 64},
        headers={"Idempotency-Key": "customer-request-123"},
    )
    await client.close()

    assert requests[0].headers["Idempotency-Key"] == "customer-request-123"

