"""
OTRUST Proof Service.

Zero-knowledge identity and attribute proofs.
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Literal

from .client import get_client
from .result import Result, OTrustError, ok, err


ProofType = Literal["identity", "age", "membership"]
ProofStatus = Literal["active", "revoked", "expired"]
WalletFormat = Literal["apple"]


@dataclass
class VerificationStatus:
    """Verification details."""

    face_match: bool | None = None
    liveness_verified: bool | None = None
    document_verified: bool | None = None
    timestamp: str | None = None


@dataclass
class IdentityProof:
    """Identity proof response."""

    proof_id: str
    """Unique proof ID (e.g., "id_abc123")"""

    type: Literal["identity"]
    """Proof type"""

    commitment: str
    """Proof commitment (public)"""

    secret: str
    """Secret key (private - store securely!)"""

    statement: str
    """Statement describing the proof"""

    verification: VerificationStatus
    """Verification details"""

    share_url: str
    """Shareable URL"""

    wallet_url: str
    """Wallet pass URL"""

    created_at: str
    """When created"""

    expires_at: str | None = None
    """When expires"""


@dataclass
class AgeProof:
    """Age proof response."""

    proof_id: str
    type: Literal["age"]
    commitment: str
    secret: str
    min_age: int
    share_url: str
    verify_url: str


@dataclass
class MembershipProof:
    """Membership proof response."""

    proof_id: str
    type: Literal["membership"]
    commitment: str
    secret: str
    organization_name: str
    share_url: str
    verify_url: str


@dataclass
class ProofDetails:
    """Proof details (for viewing)."""

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
    """Options for creating an identity proof."""

    personnummer: str
    """Swedish personal identity number (YYYYMMDD-XXXX)"""

    birth_date: str
    """Birth date (YYYY-MM-DD)"""

    face_match: bool = False
    """Whether face verification was performed"""

    liveness_verified: bool = False
    """Whether liveness detection was performed"""

    document_verified: bool = False
    """Whether document was verified"""


async def identity(
    personnummer: str,
    birth_date: str,
    face_match: bool = False,
    liveness_verified: bool = False,
    document_verified: bool = False,
) -> Result[IdentityProof, OTrustError]:
    """
    Create a new identity proof.

    IMPORTANT: Store the returned `secret` securely!
    It's the only way to prove you own this identity.

    Args:
        personnummer: Swedish personal identity number
        birth_date: Birth date (YYYY-MM-DD)
        face_match: Whether face verification was performed
        liveness_verified: Whether liveness detection was performed
        document_verified: Whether document was verified

    Returns:
        Result with IdentityProof on success

    Example:
        >>> result = await proof.identity(
        ...     personnummer="19900101-1234",
        ...     birth_date="1990-01-01",
        ...     face_match=True,
        ...     liveness_verified=True,
        ... )
        >>> if result.ok:
        ...     print(f"Proof ID: {result.value.proof_id}")
        ...     print(f"SECRET (save this!): {result.value.secret}")
    """
    client = get_client()
    result = await client.post("/api/proof/identity", {
        "personnummer": personnummer,
        "birthDate": birth_date,
        "faceMatch": face_match,
        "livenessVerified": liveness_verified,
        "documentVerified": document_verified,
    })

    if not result.ok:
        return result  # type: ignore

    data = result.value
    return ok(IdentityProof(
        proof_id=data["proofId"],
        type="identity",
        commitment=data["commitment"],
        secret=data["secret"],
        statement=data.get("statement", ""),
        verification=VerificationStatus(
            face_match=data.get("verification", {}).get("faceMatch"),
            liveness_verified=data.get("verification", {}).get("livenessVerified"),
            document_verified=data.get("verification", {}).get("documentVerified"),
            timestamp=data.get("verification", {}).get("timestamp"),
        ),
        share_url=data.get("shareUrl", ""),
        wallet_url=data.get("walletUrl", ""),
        created_at=data.get("createdAt", ""),
        expires_at=data.get("expiresAt"),
    ))


async def age(
    birth_date: str,
    min_age: int = 18,
) -> Result[AgeProof, OTrustError]:
    """
    Create an age proof (e.g., for 18+ verification).

    Args:
        birth_date: Birth date (YYYY-MM-DD)
        min_age: Minimum age to prove (default: 18)

    Returns:
        Result with AgeProof on success

    Example:
        >>> result = await proof.age("1990-01-01", min_age=18)
        >>> if result.ok:
        ...     print(f"Age proof: {result.value.proof_id}")
    """
    client = get_client()
    result = await client.post("/api/proof/age", {
        "birthDate": birth_date,
        "minAge": min_age,
    })

    if not result.ok:
        return result  # type: ignore

    data = result.value
    return ok(AgeProof(
        proof_id=data["proofId"],
        type="age",
        commitment=data["commitment"],
        secret=data["secret"],
        min_age=min_age,
        share_url=data.get("shareUrl", ""),
        verify_url=data.get("verifyUrl", ""),
    ))


async def membership(
    member_id: str,
    organization_id: str,
    organization_name: str,
    role: str | None = None,
    valid_until: str | None = None,
) -> Result[MembershipProof, OTrustError]:
    """
    Create a membership proof.

    Args:
        member_id: Unique member identifier
        organization_id: Organization identifier
        organization_name: Organization display name
        role: Optional role/tier
        valid_until: Optional expiry date (ISO 8601)

    Returns:
        Result with MembershipProof on success
    """
    client = get_client()
    result = await client.post("/api/proof/membership", {
        "memberId": member_id,
        "organizationId": organization_id,
        "organizationName": organization_name,
        "role": role,
        "validUntil": valid_until,
    })

    if not result.ok:
        return result  # type: ignore

    data = result.value
    return ok(MembershipProof(
        proof_id=data["proofId"],
        type="membership",
        commitment=data["commitment"],
        secret=data["secret"],
        organization_name=organization_name,
        share_url=data.get("shareUrl", ""),
        verify_url=data.get("verifyUrl", ""),
    ))


async def get(proof_id: str) -> Result[ProofDetails, OTrustError]:
    """
    Get proof details.

    Args:
        proof_id: Proof ID to retrieve

    Returns:
        Result with ProofDetails on success

    Example:
        >>> result = await proof.get("id_abc123")
        >>> if result.ok:
        ...     print(f"Status: {result.value.status}")
    """
    client = get_client()
    result = await client.get(f"/api/proof/{proof_id}")

    if not result.ok:
        return result  # type: ignore

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
        type=data.get("type", "identity"),
        statement=data.get("statement"),
        commitment=data.get("commitment", ""),
        verification=verification,
        status=data.get("status", "active"),
        created_at=data.get("createdAt", ""),
        expires_at=data.get("expiresAt"),
    ))


async def verify(proof_id: str) -> Result[dict, OTrustError]:
    """
    Verify a proof is valid.

    Args:
        proof_id: Proof ID to verify

    Returns:
        Result with verification status

    Example:
        >>> result = await proof.verify("id_abc123")
        >>> if result.ok and result.value["valid"]:
        ...     print("Proof is valid!")
    """
    client = get_client()
    result = await client.post(f"/api/proof/{proof_id}/verify", {})

    return result


async def wallet(
    proof_id: str,
    format: WalletFormat = "apple",
) -> Result[dict, OTrustError]:
    """
    Get wallet pass data.

    Args:
        proof_id: Proof ID
        format: Wallet format ("apple")

    Returns:
        Result with wallet pass URLs

    Example:
        >>> result = await proof.wallet("id_abc123", "apple")
        >>> if result.ok:
        ...     print(f"Save URL: {result.value.get('saveUrl')}")
    """
    client = get_client()
    result = await client.get(f"/api/proof/{proof_id}/wallet?format={format}")

    return result


async def revoke(proof_id: str) -> Result[dict, OTrustError]:
    """
    Revoke a proof (returns recovery token).

    Args:
        proof_id: Proof ID to revoke

    Returns:
        Result with recovery token

    Example:
        >>> result = await proof.revoke("id_abc123")
        >>> if result.ok:
        ...     print(f"Recovery token: {result.value.get('recoveryToken')}")
    """
    client = get_client()
    result = await client.post(f"/api/proof/{proof_id}/revoke", {})

    return result


async def email_backup(
    email: str,
    proof_id: str,
    secret: str,
    commitment: str,
) -> Result[dict, OTrustError]:
    """
    Send backup of proof to email.

    Args:
        email: Email address to send backup to
        proof_id: Proof ID
        secret: Proof secret
        commitment: Proof commitment

    Returns:
        Result with confirmation
    """
    client = get_client()
    result = await client.post("/api/proof/backup/email", {
        "email": email,
        "proofId": proof_id,
        "secret": secret,
        "commitment": commitment,
    })

    return result
