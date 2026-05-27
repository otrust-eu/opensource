"""
OTRUST Auth Service.

OAuth2/OpenID Connect authentication with zero-knowledge proofs.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Literal
from urllib.parse import urlencode
import secrets

from .client import get_client
from .result import Result, OTrustError, ok, err


Scope = Literal["identity", "age:18", "age:21", "membership"]


@dataclass
class Challenge:
    """Challenge for passwordless auth."""

    challenge_id: str
    """Unique challenge ID"""

    challenge: str
    """Challenge string to sign"""

    created_at: str
    """When created"""

    expires_at: str
    """When expires"""


@dataclass
class AuthConfig:
    """Configuration for OAuth flow."""

    client_id: str
    """OAuth client ID"""

    redirect_uri: str
    """OAuth redirect URI"""

    scopes: list[Scope] = field(default_factory=lambda: ["identity"])
    """Requested scopes"""


@dataclass
class TokenResponse:
    """OAuth token response."""

    access_token: str
    """Access token"""

    token_type: str
    """Token type (usually "Bearer")"""

    expires_in: int
    """Seconds until expiry"""

    id_token: str | None = None
    """OpenID Connect ID token"""

    refresh_token: str | None = None
    """Refresh token"""


@dataclass
class UserInfo:
    """User info from OIDC userinfo endpoint."""

    sub: str
    """Subject identifier"""

    proof_type: str | None = None
    """Type of proof (identity, age, membership)"""

    commitment: str | None = None
    """Proof commitment"""

    verified_at: str | None = None
    """When identity was verified"""

    age_verified: bool | None = None
    """Whether age was verified"""

    min_age: int | None = None
    """Minimum age proven"""

    member_of: str | None = None
    """Organization membership"""


_state_store: dict[str, str] = {}


def create_challenge() -> str:
    """
    Create a cryptographic challenge for auth.

    Returns:
        Random challenge string

    Example:
        >>> challenge = auth.create_challenge()
        >>> print(f"Challenge: {challenge}")
    """
    return secrets.token_hex(32)


def login_url(
    client_id: str,
    redirect_uri: str,
    scope: Scope | list[Scope] = "identity",
    state: str | None = None,
) -> str:
    """
    Generate OAuth login URL.

    Args:
        client_id: OAuth client ID
        redirect_uri: Callback URL
        scope: Requested scope(s)
        state: Optional state parameter (auto-generated if not provided)

    Returns:
        Login URL to redirect user to

    Example:
        >>> url = auth.login_url(
        ...     client_id="my-app",
        ...     redirect_uri="https://myapp.com/callback",
        ...     scope="identity",
        ... )
        >>> print(f"Redirect to: {url}")
    """
    from .client import get_client
    client = get_client()

    if state is None:
        state = secrets.token_urlsafe(32)

    # Store state for verification
    _state_store[state] = state

    scopes = [scope] if isinstance(scope, str) else scope
    scope_str = " ".join(scopes)

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": scope_str,
        "state": state,
    }

    return f"{client.base_url}/oauth/authorize?{urlencode(params)}"


async def prove(
    code: str,
    client_id: str,
    client_secret: str,
    redirect_uri: str,
) -> Result[TokenResponse, OTrustError]:
    """
    Exchange authorization code for tokens.

    Args:
        code: Authorization code from callback
        client_id: OAuth client ID
        client_secret: OAuth client secret
        redirect_uri: Same redirect URI used in login_url

    Returns:
        Result with TokenResponse on success

    Example:
        >>> result = await auth.prove(
        ...     code=code_from_callback,
        ...     client_id="my-app",
        ...     client_secret="secret",
        ...     redirect_uri="https://myapp.com/callback",
        ... )
        >>> if result.ok:
        ...     print(f"Access token: {result.value.access_token}")
    """
    client = get_client()

    # Use form data for token endpoint
    import httpx
    try:
        response = await client._client.post(
            f"{client.base_url}/oauth/token",
            data={
                "grant_type": "authorization_code",
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
            },
        )
        response.raise_for_status()
        data = response.json()
    except httpx.HTTPStatusError as e:
        return err(OTrustError(
            code="token_error",
            message=str(e),
            status=e.response.status_code,
        ))
    except Exception as e:
        return err(OTrustError(
            code="token_error",
            message=str(e),
        ))

    return ok(TokenResponse(
        access_token=data["access_token"],
        token_type=data.get("token_type", "Bearer"),
        expires_in=data.get("expires_in", 3600),
        id_token=data.get("id_token"),
        refresh_token=data.get("refresh_token"),
    ))


async def verify(
    token: str,
) -> Result[dict, OTrustError]:
    """
    Verify an access token.

    Args:
        token: Access token to verify

    Returns:
        Result with token info

    Example:
        >>> result = await auth.verify(access_token)
        >>> if result.ok:
        ...     print(f"Token valid: {result.value.get('active')}")
    """
    client = get_client()

    import httpx
    try:
        response = await client._client.post(
            f"{client.base_url}/oauth/introspect",
            data={"token": token},
        )
        response.raise_for_status()
        return ok(response.json())
    except httpx.HTTPStatusError as e:
        return err(OTrustError(
            code="verify_error",
            message=str(e),
            status=e.response.status_code,
        ))
    except Exception as e:
        return err(OTrustError(
            code="verify_error",
            message=str(e),
        ))


async def userinfo(
    access_token: str,
) -> Result[UserInfo, OTrustError]:
    """
    Get user information from access token.

    Args:
        access_token: Valid access token

    Returns:
        Result with UserInfo on success

    Example:
        >>> result = await auth.userinfo(access_token)
        >>> if result.ok:
        ...     print(f"Subject: {result.value.sub}")
    """
    client = get_client()

    import httpx
    try:
        response = await client._client.get(
            f"{client.base_url}/oauth/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        response.raise_for_status()
        data = response.json()
    except httpx.HTTPStatusError as e:
        return err(OTrustError(
            code="userinfo_error",
            message=str(e),
            status=e.response.status_code,
        ))
    except Exception as e:
        return err(OTrustError(
            code="userinfo_error",
            message=str(e),
        ))

    return ok(UserInfo(
        sub=data["sub"],
        proof_type=data.get("proof_type"),
        commitment=data.get("commitment"),
        verified_at=data.get("verified_at"),
        age_verified=data.get("age_verified"),
        min_age=data.get("min_age"),
        member_of=data.get("member_of"),
    ))


async def refresh(
    refresh_token: str,
    client_id: str,
    client_secret: str,
) -> Result[TokenResponse, OTrustError]:
    """
    Refresh an access token.

    Args:
        refresh_token: Refresh token
        client_id: OAuth client ID
        client_secret: OAuth client secret

    Returns:
        Result with new TokenResponse on success
    """
    client = get_client()

    import httpx
    try:
        response = await client._client.post(
            f"{client.base_url}/oauth/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": client_id,
                "client_secret": client_secret,
            },
        )
        response.raise_for_status()
        data = response.json()
    except httpx.HTTPStatusError as e:
        return err(OTrustError(
            code="refresh_error",
            message=str(e),
            status=e.response.status_code,
        ))
    except Exception as e:
        return err(OTrustError(
            code="refresh_error",
            message=str(e),
        ))

    return ok(TokenResponse(
        access_token=data["access_token"],
        token_type=data.get("token_type", "Bearer"),
        expires_in=data.get("expires_in", 3600),
        id_token=data.get("id_token"),
        refresh_token=data.get("refresh_token"),
    ))


def parse_callback(url: str) -> dict | None:
    """
    Parse OAuth callback URL.

    Args:
        url: Full callback URL with query parameters

    Returns:
        Dict with code and state, or None if invalid

    Example:
        >>> params = auth.parse_callback(request.url)
        >>> if params and params.get("code"):
        ...     result = await auth.prove(params["code"], ...)
    """
    from urllib.parse import urlparse, parse_qs

    try:
        parsed = urlparse(url)
        params = parse_qs(parsed.query)

        code = params.get("code", [None])[0]
        state = params.get("state", [None])[0]
        error = params.get("error", [None])[0]

        if error:
            return {"error": error, "error_description": params.get("error_description", [None])[0]}

        if not code:
            return None

        # Verify state
        if state and state not in _state_store:
            return {"error": "invalid_state"}

        # Clean up used state
        if state:
            _state_store.pop(state, None)

        return {"code": code, "state": state}
    except Exception:
        return None


def verify_state(state: str) -> bool:
    """
    Verify OAuth state parameter.

    Args:
        state: State from callback

    Returns:
        True if state is valid
    """
    return state in _state_store


def clear_state(state: str) -> None:
    """
    Clear used state parameter.

    Args:
        state: State to clear
    """
    _state_store.pop(state, None)
