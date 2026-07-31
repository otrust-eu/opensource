"""OTRUST proof-service client with explicit trust boundaries."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, cast

from .client import get_client
from .result import OTrustError, Result, err, ok

ProofType = Literal["identity", "age", "income", "membership"]
ProofStatus = Literal["active", "revoked", "expired"]
WalletFormat = Literal["apple", "google"]


@dataclass
class VerificationStatus:
    """Public verification details returned by the service."""

    face_match: bool | None = None
    liveness_verified: bool | None = None
    document_verified: bool | None = None
    timestamp: str | None = None


@dataclass
class IdentityProof:
    """Issuer-bound identity credential response."""

    proof_id: str
    type: Literal["identity"]
    commitment: str
    secret: str
    statement: str
    verification: VerificationStatus
    share_url: str
    wallet_url: str
    created_at: str
    expires_at: str | None = None


@dataclass
class AgeProof:
    """Legacy age-proof response type."""

    proof_id: str
    type: Literal["age"]
    commitment: str
    secret: str
    min_age: int
    share_url: str
    verify_url: str


@dataclass
class IncomeProof:
    """Legacy income-proof response type."""

    proof_id: str
    type: Literal["income"]
    commitment: str
    secret: str
    min_income: int
    max_income: int
    share_url: str
    verify_url: str


@dataclass
class MembershipProof:
    """Legacy membership-proof response type."""

    proof_id: str
    type: Literal["membership"]
    commitment: str
    secret: str
    organization_name: str
    share_url: str
    verify_url: str


@dataclass
class ProofDetails:
    """Public proof details."""

    id: str
    type: ProofType
    commitment: str
    status: ProofStatus
    created_at: str
    statement: str | None = None
    verification: VerificationStatus | None = None
    expires_at: str | None = None


@dataclass
class IdentityOptions:
    """Legacy identity options retained for source compatibility."""

    personnummer: str
    birth_date: str
    face_match: bool = False
    liveness_verified: bool = False
    document_verified: bool = False


async def identity(
    personnummer: str,
    birth_date: str,
    face_match: bool = False,
    liveness_verified: bool = False,
    document_verified: bool = False,
) -> Result[IdentityProof, OTrustError]:
    """Return the production identity-issuer gate without sending personal data."""
    _ = (personnummer, birth_date, face_match, liveness_verified, document_verified)
    return err(OTrustError(
        "trusted_identity_issuer_required",
        "Trusted identity issuance is not currently available",
    ))


async def age(birth_date: str, min_age: int = 18) -> Result[AgeProof, OTrustError]:
    """Require local proof generation instead of sending a birth date."""
    _ = (birth_date, min_age)
    return err(OTrustError(
        "browser_proof_required",
        "Generate the age proof locally, then call submit_browser_proof",
    ))


async def income(
    private_value: int,
    min_income: int,
    max_income: int = 10_000_000,
) -> Result[IncomeProof, OTrustError]:
    """Require local proof generation instead of sending a private value."""
    _ = (private_value, min_income, max_income)
    return err(OTrustError(
        "browser_proof_required",
        "Generate the income proof locally, then call submit_browser_proof",
    ))


async def membership(
    member_id: str,
    organization_id: str,
    organization_name: str,
    role: str | None = None,
    valid_until: str | None = None,
) -> Result[MembershipProof, OTrustError]:
    """Report that membership proof generation is not supported."""
    _ = (member_id, organization_id, organization_name, role, valid_until)
    return err(OTrustError(
        "feature_unavailable",
        "Membership proof generation is not supported",
    ))


async def submit_browser_proof(
    proof_type: Literal["age", "income"],
    proof_data: dict[str, Any],
    public_signals: list[str],
    commitment: str,
    version: Literal["groth16-v3"] = "groth16-v3",
) -> Result[dict[str, Any], OTrustError]:
    """
    Submit an already-generated Groth16 proof.

    This allowlist sends only the proof contract. Private circuit inputs must be
    processed in a trusted local environment before calling this function.
    """
    client = get_client()
    return await client.post("/api/proof/submit", {
        "proofType": proof_type,
        "version": version,
        "proof": proof_data,
        "publicSignals": public_signals,
        "commitment": commitment,
    })


async def get(proof_id: str) -> Result[ProofDetails, OTrustError]:
    """Get public proof details."""
    client = get_client()
    result = await client.get(f"/api/proof/{proof_id}")
    if not result.ok:
        return result

    data = result.value.get("proof", result.value)
    verification = None
    if data.get("verification"):
        verification = VerificationStatus(
            face_match=data["verification"].get("faceMatch"),
            liveness_verified=data["verification"].get("livenessVerified"),
            document_verified=data["verification"].get("documentVerified"),
            timestamp=data["verification"].get("timestamp"),
        )

    return ok(ProofDetails(
        id=data.get("id", proof_id),
        type=cast("ProofType", data.get("type", "identity")),
        statement=data.get("statement"),
        commitment=data.get("commitment", ""),
        verification=verification,
        status=cast("ProofStatus", data.get("status", "active")),
        created_at=data.get("createdAt", ""),
        expires_at=data.get("expiresAt"),
    ))


async def verify(proof_id: str) -> Result[dict[str, Any], OTrustError]:
    """Ask the service to cryptographically verify a stored proof."""
    client = get_client()
    return await client.post(f"/api/proof/{proof_id}/verify", {})


async def wallet(
    proof_id: str,
    format: WalletFormat = "apple",
) -> Result[dict[str, Any], OTrustError]:
    """Get wallet metadata for an issuer-bound identity credential."""
    client = get_client()
    return await client.get(f"/api/proof/{proof_id}/wallet?format={format}")


async def revoke(proof_id: str) -> Result[dict[str, Any], OTrustError]:
    """Require authenticated issuer revocation without making a request."""
    _ = proof_id
    return err(OTrustError(
        "trusted_identity_issuer_required",
        "Credential revocation requires an authenticated issuer integration",
    ))


async def email_backup(
    email: str,
    proof_id: str,
    secret: str,
    commitment: str,
) -> Result[dict[str, Any], OTrustError]:
    """Report that client-supplied identity backup email is retired."""
    _ = (email, proof_id, secret, commitment)
    return err(OTrustError(
        "legacy_feature_retired",
        "Client-supplied identity backup email is retired",
    ))
