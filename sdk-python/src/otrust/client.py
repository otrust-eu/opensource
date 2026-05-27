"""
HTTP client for OTRUST API.

Handles configuration, retry logic, and response parsing.
"""

from __future__ import annotations
import asyncio
from dataclasses import dataclass, field
from typing import Any, TypeVar
import httpx

from .result import Result, Ok, Err, OTrustError

T = TypeVar("T")


@dataclass
class ClientConfig:
    """Configuration for the OTRUST client."""

    base_url: str = "https://otrust.eu"
    timeout: float = 30.0
    retries: int = 3
    retry_delay: float = 1.0
    headers: dict[str, str] = field(default_factory=dict)


# Global configuration
_config = ClientConfig()


def configure(
    base_url: str | None = None,
    timeout: float | None = None,
    retries: int | None = None,
    retry_delay: float | None = None,
    headers: dict[str, str] | None = None,
) -> None:
    """
    Configure the OTRUST SDK.

    Args:
        base_url: API base URL (default: https://otrust.eu)
        timeout: Request timeout in seconds (default: 30)
        retries: Number of retry attempts (default: 3)
        retry_delay: Delay between retries in seconds (default: 1.0)
        headers: Additional headers to include in requests

    Example:
        >>> from otrust import configure
        >>> configure(
        ...     base_url="https://staging.otrust.eu",
        ...     timeout=60,
        ... )
    """
    global _config

    if base_url is not None:
        _config.base_url = base_url.rstrip("/")
    if timeout is not None:
        _config.timeout = timeout
    if retries is not None:
        _config.retries = retries
    if retry_delay is not None:
        _config.retry_delay = retry_delay
    if headers is not None:
        _config.headers.update(headers)


def get_config() -> ClientConfig:
    """Get current configuration."""
    return _config


class OTrustClient:
    """
    HTTP client for OTRUST API with retry logic and error handling.

    Example:
        >>> client = OTrustClient()
        >>> result = await client.get("/api/health")
        >>> if result.ok:
        ...     print(result.value)
    """

    def __init__(self, config: ClientConfig | None = None):
        self.config = config or _config
        self._client: httpx.AsyncClient | None = None

    @property
    def base_url(self) -> str:
        """Get the base URL."""
        return self.config.base_url

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create the HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self.config.base_url,
                timeout=self.config.timeout,
                headers={
                    "User-Agent": "OTRUST-SDK-Python/1.0.0",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    **self.config.headers,
                },
            )
        return self._client

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def _request(
        self,
        method: str,
        path: str,
        json: dict[str, Any] | None = None,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> Result[dict[str, Any], OTrustError]:
        """Make an HTTP request with retry logic."""
        client = await self._get_client()
        last_error: Exception | None = None

        for attempt in range(self.config.retries):
            try:
                response = await client.request(
                    method=method,
                    url=path,
                    json=json,
                    params=params,
                    headers=headers,
                )

                # Parse response
                try:
                    data = response.json()
                except Exception:
                    data = {"raw": response.text}

                # Handle errors
                if response.status_code >= 400:
                    error_msg = data.get("error", data.get("message", "Unknown error"))
                    error_code = data.get("code", f"http_{response.status_code}")
                    return Err(
                        OTrustError(
                            code=error_code,
                            message=error_msg,
                            status=response.status_code,
                            details=data,
                        )
                    )

                return Ok(data)

            except httpx.TimeoutException as e:
                last_error = e
                if attempt < self.config.retries - 1:
                    await asyncio.sleep(self.config.retry_delay * (attempt + 1))
                continue

            except httpx.RequestError as e:
                last_error = e
                if attempt < self.config.retries - 1:
                    await asyncio.sleep(self.config.retry_delay * (attempt + 1))
                continue

        return Err(
            OTrustError(
                code="network_error",
                message=f"Request failed after {self.config.retries} attempts: {last_error}",
            )
        )

    async def get(
        self,
        path: str,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> Result[dict[str, Any], OTrustError]:
        """Make a GET request."""
        return await self._request("GET", path, params=params, headers=headers)

    async def post(
        self,
        path: str,
        json: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> Result[dict[str, Any], OTrustError]:
        """Make a POST request."""
        return await self._request("POST", path, json=json, headers=headers)

    async def put(
        self,
        path: str,
        json: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> Result[dict[str, Any], OTrustError]:
        """Make a PUT request."""
        return await self._request("PUT", path, json=json, headers=headers)

    async def delete(
        self,
        path: str,
        headers: dict[str, str] | None = None,
    ) -> Result[dict[str, Any], OTrustError]:
        """Make a DELETE request."""
        return await self._request("DELETE", path, headers=headers)


# Global client instance
_client: OTrustClient | None = None


def get_client() -> OTrustClient:
    """Get or create the global client instance."""
    global _client
    if _client is None:
        _client = OTrustClient()
    return _client


async def close_client() -> None:
    """Close the global client instance."""
    global _client
    if _client is not None:
        await _client.close()
        _client = None
