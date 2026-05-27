"""
OTRUST Sign Service.

Multi-party document signing with zero-knowledge proofs.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from pathlib import Path
from typing import BinaryIO, Literal

from .client import get_client
from .result import Result, Ok, Err, OTrustError, ok, err
from .crypto import sha256, hash_file, is_valid_hash


PartyRole = Literal["signer", "approver", "viewer"]
PartyAction = Literal["signed", "approved", "viewed", "declined"] | None
SignStatus = Literal["pending", "completed", "expired", "cancelled", "declined"]
SigningOrder = Literal["parallel", "sequential"]


@dataclass
class Party:
    """Party in a sign request."""

    email: str
    """Email address"""

    role: PartyRole = "signer"
    """Role: signer, approver, or viewer"""

    name: str | None = None
    """Display name"""

    order: int | None = None
    """Order for sequential signing"""


@dataclass
class PartyStatus:
    """Party status in a sign request."""

    email: str
    name: str | None
    role: PartyRole
    action: PartyAction
    notified_at: str | None = None
    acted_at: str | None = None


@dataclass
class SignRequest:
    """Sign request response."""

    id: str
    """Unique request ID (e.g., "sr_xyz789")"""

    document_hash: str
    """Document hash"""

    title: str
    """Document title/name"""

    creator_email: str
    """Creator email"""

    parties: list[PartyStatus]
    """All parties"""

    signing_order: SigningOrder
    """Signing order"""

    status: SignStatus
    """Current status"""

    created_at: str
    """When created"""

    status_url: str
    """Status page URL"""

    message: str | None = None
    """Optional message to parties"""

    deadline: str | None = None
    """Deadline for completion"""

    cancel_token: str | None = None
    """Cancel token (only for creator)"""


@dataclass
class CreateSignOptions:
    """Options for creating a sign request."""

    title: str
    """Document title/name"""

    parties: list[Party]
    """Parties to sign"""

    creator_email: str
    """Creator email"""

    message: str | None = None
    """Optional message"""

    signing_order: SigningOrder = "parallel"
    """Signing order: parallel (default) or sequential"""

    deadline: str | None = None
    """Deadline as ISO string or relative string like "7d\""""

    document_url: str | None = None
    """Document URL (if not using temporary storage)"""


async def create(
    document: str | bytes | Path | BinaryIO,
    options: CreateSignOptions,
) -> Result[SignRequest, OTrustError]:
    """
    Create a new multi-party signing request.

    Args:
        document: Document to sign (file path, bytes, or hash)
        options: Sign request options

    Returns:
        Result with SignRequest on success

    Example:
        >>> result = await sign.create(
        ...     Path("contract.pdf"),
        ...     CreateSignOptions(
        ...         title="Contract Agreement",
        ...         creator_email="alice@example.com",
        ...         parties=[
        ...             Party(email="bob@example.com", role="signer"),
        ...             Party(email="carol@example.com", role="approver"),
        ...         ],
        ...         deadline="7d",
        ...     ),
        ... )
    """
    # Get document hash
    if isinstance(document, Path):
        doc_hash = hash_file(document)
    elif isinstance(document, str):
        if is_valid_hash(document):
            doc_hash = document.lower()
        else:
            doc_hash = sha256(document)
    elif isinstance(document, bytes):
        doc_hash = sha256(document)
    else:
        doc_hash = hash_file(document)

    client = get_client()
    result = await client.post("/api/sign/request", {
        "documentHash": doc_hash,
        "title": options.title,
        "creatorEmail": options.creator_email,
        "parties": [
            {
                "email": p.email,
                "name": p.name,
                "role": p.role,
                "order": p.order,
            }
            for p in options.parties
        ],
        "message": options.message,
        "signingOrder": options.signing_order,
        "deadline": options.deadline,
        "documentUrl": options.document_url,
    })

    if not result.ok:
        return result  # type: ignore

    return _parse_sign_request(result.value)


async def status(request_id: str, view_token: str | None = None) -> Result[SignRequest, OTrustError]:
    """
    Get the status of a signing request.

    Args:
        request_id: Sign request ID
        view_token: Optional view token for non-creators

    Returns:
        Result with SignRequest on success

    Example:
        >>> result = await sign.status("sr_xyz789")
        >>> if result.ok:
        ...     print(f"Status: {result.value.status}")
    """
    client = get_client()
    path = f"/api/sign/{request_id}"
    if view_token:
        path += f"?token={view_token}"

    result = await client.get(path)

    if not result.ok:
        return result  # type: ignore

    return _parse_sign_request(result.value)


async def cancel(request_id: str, cancel_token: str) -> Result[dict, OTrustError]:
    """
    Cancel a signing request.

    Args:
        request_id: Sign request ID
        cancel_token: Cancel token (received when creating the request)

    Returns:
        Result with cancellation confirmation
    """
    client = get_client()
    result = await client.post(f"/api/sign/{request_id}/cancel", {
        "cancelToken": cancel_token,
    })

    return result


async def remind(request_id: str, cancel_token: str) -> Result[dict, OTrustError]:
    """
    Send reminder to pending parties.

    Args:
        request_id: Sign request ID
        cancel_token: Cancel token (for authorization)

    Returns:
        Result with reminder confirmation
    """
    client = get_client()
    result = await client.post(f"/api/sign/{request_id}/remind", {
        "cancelToken": cancel_token,
    })

    return result


async def verify_document(
    request_id: str,
    document: str | bytes | Path | BinaryIO,
) -> Result[dict, OTrustError]:
    """
    Verify that a document matches the signed document.

    Args:
        request_id: Sign request ID
        document: Document to verify

    Returns:
        Result with verification result
    """
    # Get document hash
    if isinstance(document, Path):
        doc_hash = hash_file(document)
    elif isinstance(document, str):
        if is_valid_hash(document):
            doc_hash = document.lower()
        else:
            doc_hash = sha256(document)
    elif isinstance(document, bytes):
        doc_hash = sha256(document)
    else:
        doc_hash = hash_file(document)

    client = get_client()
    result = await client.post(f"/api/sign/{request_id}/verify", {
        "documentHash": doc_hash,
    })

    return result


async def get_package(request_id: str) -> Result[dict, OTrustError]:
    """
    Get the complete signature package (all signatures, timestamps, etc).

    Args:
        request_id: Sign request ID

    Returns:
        Result with signature package
    """
    client = get_client()
    result = await client.get(f"/api/sign/{request_id}/package")

    return result


def _parse_sign_request(data: dict) -> Result[SignRequest, OTrustError]:
    """Parse API response into SignRequest."""
    parties = []
    for p in data.get("parties", []):
        parties.append(PartyStatus(
            email=p["email"],
            name=p.get("name"),
            role=p.get("role", "signer"),
            action=p.get("action"),
            notified_at=p.get("notifiedAt"),
            acted_at=p.get("actedAt"),
        ))

    return ok(SignRequest(
        id=data["id"],
        document_hash=data.get("documentHash", ""),
        title=data.get("title", ""),
        creator_email=data.get("creatorEmail", ""),
        parties=parties,
        signing_order=data.get("signingOrder", "parallel"),
        status=data.get("status", "pending"),
        created_at=data.get("createdAt", ""),
        status_url=data.get("statusUrl", ""),
        message=data.get("message"),
        deadline=data.get("deadline"),
        cancel_token=data.get("cancelToken"),
    ))
