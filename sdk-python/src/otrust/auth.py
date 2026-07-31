"""Issuer-bound OTRUST partner authentication."""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from typing import Any, Literal, cast
from urllib.parse import parse_qs, urlparse

from .client import get_client
from .result import OTrustError, Result, err, ok

AuthScope = Literal["identity", "email", "verification"]


@dataclass
class AuthChallenge:
    """Short-lived hosted Auth challenge."""

    challenge_id: str
    challenge: str
    login_url: str
    expires_in: int


@dataclass
class AuthToken:
    """Token returned after credential ownership is proven."""

    token: str
    redirect_url: str
    expires_in: int


@dataclass
class VerifiedIdentity:
    """Verified trusted issuer-bound Auth token."""

    valid: bool
    proof_id: str
    client_id: str
    scope: list[AuthScope]
    issued_at: str
    expires_at: str
    identity: dict[str, Any] | None = None


@dataclass
class UserInfo:
    """Current issuer-bound identity information."""

    proof_id: str
    verified: bool
    credential_binding: Literal["trusted_issuer"]
    created_at: str
    issuer: dict[str, Any] | None = None
    identity_hash: str | None = None
    verification: dict[str, Any] | None = None
    expires_at: str | None = None


def generate_state() -> str:
    """Generate a 128-bit state value for storage in the caller's session."""
    return secrets.token_hex(16)


async def create_challenge(
    client_id: str,
    redirect_uri: str,
    scope: list[AuthScope] | None = None,
    state: str | None = None,
) -> Result[AuthChallenge, OTrustError]:
    """
    Create a registered server challenge.

    Production returns an error until a trusted issuer and an exact client
    redirect allowlist are configured.
    """
    if not client_id or not redirect_uri:
        return err(OTrustError(
            "validation_error",
            "client_id and redirect_uri are required",
        ))

    client = get_client()
    effective_state = state or generate_state()
    result = await client.post("/api/v1/auth/challenge", {
        "clientId": client_id,
        "redirectUri": redirect_uri,
        "scope": scope or ["identity"],
        "state": effective_state,
    })
    if not result.ok:
        return result

    data = result.value
    return ok(AuthChallenge(
        challenge_id=data["challengeId"],
        challenge=data["challenge"],
        login_url=data["loginUrl"],
        expires_in=data["expiresIn"],
    ))


def login_url(
    client_id: str,
    redirect_uri: str,
    scope: AuthScope | list[AuthScope] = "identity",
    state: str | None = None,
) -> Result[str, OTrustError]:
    """Return a local error because only create_challenge can issue a valid URL."""
    _ = (client_id, redirect_uri, scope, state)
    return err(OTrustError(
        "server_challenge_required",
        "Create a server challenge and use its login_url",
    ))


async def prove(
    challenge_id: str,
    proof_id: str,
    *,
    secret: str | None = None,
    pin: str | None = None,
) -> Result[AuthToken, OTrustError]:
    """Present ownership material for a trusted issuer-bound credential."""
    if not challenge_id or not proof_id:
        return err(OTrustError(
            "validation_error",
            "challenge_id and proof_id are required",
        ))
    if not secret and not pin:
        return err(OTrustError(
            "validation_error",
            "A credential secret or PIN is required",
        ))

    client = get_client()
    result = await client.post("/api/v1/auth/prove", {
        "challengeId": challenge_id,
        "proofId": proof_id,
        "secret": secret,
        "pin": pin,
    })
    if not result.ok:
        return result

    data = result.value
    return ok(AuthToken(
        token=data["token"],
        redirect_url=data["redirectUrl"],
        expires_in=data["expiresIn"],
    ))


async def verify(token: str) -> Result[VerifiedIdentity, OTrustError]:
    """Verify an Auth token and its current trusted issuer binding."""
    if not token:
        return err(OTrustError("validation_error", "token is required"))

    client = get_client()
    result = await client.post("/api/v1/auth/verify", {"token": token})
    if not result.ok:
        return result

    data = result.value
    return ok(VerifiedIdentity(
        valid=bool(data["valid"]),
        proof_id=data["proofId"],
        client_id=data["clientId"],
        scope=cast("list[AuthScope]", data.get("scope", [])),
        issued_at=data["issuedAt"],
        expires_at=data["expiresAt"],
        identity=data.get("identity"),
    ))


async def userinfo(token: str) -> Result[UserInfo, OTrustError]:
    """Fetch current issuer-bound user information with a Bearer token."""
    if not token:
        return err(OTrustError("validation_error", "token is required"))

    client = get_client()
    result = await client.get(
        "/api/v1/auth/userinfo",
        headers={"Authorization": f"Bearer {token}"},
    )
    if not result.ok:
        return result

    data = result.value
    if data.get("credentialBinding") != "trusted_issuer":
        return err(OTrustError(
            "trusted_identity_credential_required",
            "Auth userinfo is not backed by a trusted issuer",
        ))

    return ok(UserInfo(
        proof_id=data["proofId"],
        verified=bool(data["verified"]),
        credential_binding="trusted_issuer",
        issuer=data.get("issuer"),
        identity_hash=data.get("identityHash"),
        verification=data.get("verification"),
        created_at=data["createdAt"],
        expires_at=data.get("expiresAt"),
    ))


def parse_callback(url: str) -> dict[str, str]:
    """
    Parse token and state without deciding whether state is valid.

    Compare the returned state with the value stored in the caller's own
    browser or server session.
    """
    try:
        params = parse_qs(urlparse(url).query)
        return {
            key: value[0]
            for key in ("token", "state", "error", "error_description")
            if (value := params.get(key)) and value[0]
        }
    except (TypeError, ValueError):
        return {}


def verify_state(expected: str, received: str) -> bool:
    """Compare callback state values in constant time."""
    if not expected or not received:
        return False
    return secrets.compare_digest(expected, received)


def clear_state(_state: str) -> None:
    """Compatibility no-op; state storage belongs to the calling application."""
