"""
OTRUST Timestamp Service.

Bitcoin-anchored timestamps via OpenTimestamps.
Prove that data existed at a specific point in time.
"""

from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, Callable, Literal

from .client import get_client
from .result import Result, Ok, Err, OTrustError, ok, err
from .crypto import sha256, hash_file, hash_file_with_progress, is_valid_hash


@dataclass
class TimestampClaim:
    """Timestamp claim response."""

    receipt_id: str
    """Unique receipt ID (e.g., "ot_abc123")"""

    hash: str
    """SHA-256 hash of the timestamped data"""

    created_at: str
    """When the claim was created (ISO 8601)"""

    proof_url: str
    """URL to view the proof"""

    blockchain_status: Literal["pending", "confirmed"]
    """Current blockchain status"""

    block_number: int | None = None
    """Bitcoin block number if confirmed"""

    tx_hash: str | None = None
    """Bitcoin transaction hash if confirmed"""


@dataclass
class VerifyResult:
    """Verification result."""

    exists: bool
    """Whether the hash was found"""

    claim: TimestampClaim | None = None
    """Claim details if found"""


@dataclass
class BulkVerifyResult:
    """Bulk verification result."""

    results: list[dict]
    """Results for each hash"""


@dataclass
class CreateOptions:
    """Options for creating a timestamp."""

    source: str | None = None
    """Source identifier"""

    email: str | None = None
    """Email for notification when blockchain confirmed"""

    filename: str | None = None
    """Original filename (for reference)"""

    pubkey: str | None = None
    """Ed25519 public key (hex) for signed claims"""

    signature: str | None = None
    """Ed25519 signature (hex) for signed claims"""


async def create(
    data: str | bytes | Path | BinaryIO,
    options: CreateOptions | None = None,
) -> Result[TimestampClaim, OTrustError]:
    """
    Create a timestamp for data or a file.

    This is the main entry point - handles hashing automatically.

    Args:
        data: String, bytes, file path, or file-like object to timestamp
        options: Optional creation options

    Returns:
        Result with TimestampClaim on success

    Example:
        >>> result = await timestamp.create("Hello, World!")
        >>> if result.ok:
        ...     print(f"Receipt: {result.value.receipt_id}")

        >>> result = await timestamp.create(Path("document.pdf"))

        >>> with open("file.txt", "rb") as f:
        ...     result = await timestamp.create(f)
    """
    # Hash the data
    if isinstance(data, Path):
        hash_value = hash_file(data)
        filename = data.name if options is None or options.filename is None else options.filename
        if options is None:
            options = CreateOptions(filename=filename)
        elif options.filename is None:
            options.filename = filename
    elif isinstance(data, str):
        # Check if it's already a hash
        if is_valid_hash(data):
            hash_value = data.lower()
        else:
            hash_value = sha256(data)
    elif isinstance(data, bytes):
        hash_value = sha256(data)
    else:
        # File-like object
        hash_value = hash_file(data)

    return await create_simple(hash_value, options)


async def create_simple(
    hash_value: str,
    options: CreateOptions | None = None,
) -> Result[TimestampClaim, OTrustError]:
    """
    Create a timestamp using the simple API (rate-limited, no PoW).

    Args:
        hash_value: SHA-256 hash (64-character hex string)
        options: Optional creation options

    Returns:
        Result with TimestampClaim on success
    """
    if not is_valid_hash(hash_value):
        return err(OTrustError(
            code="validation_error",
            message="Invalid hash format. Expected 64-character hex string.",
        ))

    opts = options or CreateOptions()
    client = get_client()

    result = await client.post("/api/claim/simple", {
        "hash": hash_value.lower(),
        "source": opts.source or "sdk-python",
        "filename": opts.filename,
        "email": opts.email,
        "pubkey": opts.pubkey,
        "signature": opts.signature,
    })

    if not result.ok:
        return result  # type: ignore

    data = result.value
    return ok(TimestampClaim(
        receipt_id=data["receipt_id"],
        hash=hash_value.lower(),
        created_at=data["timestamp"],
        proof_url=data["proof_url"],
        blockchain_status="confirmed" if data.get("blockchain_status") == "confirmed" else "pending",
        block_number=data.get("block_number"),
        tx_hash=data.get("tx_hash"),
    ))


async def verify(
    data: str | bytes | Path | BinaryIO,
) -> Result[VerifyResult, OTrustError]:
    """
    Verify if data has been timestamped.

    Args:
        data: String, bytes, file path, or file-like object to verify

    Returns:
        Result with VerifyResult on success

    Example:
        >>> result = await timestamp.verify("Hello, World!")
        >>> if result.ok and result.value.exists:
        ...     print(f"Timestamped at: {result.value.claim.created_at}")
    """
    # Hash the data
    if isinstance(data, Path):
        hash_value = hash_file(data)
    elif isinstance(data, str):
        if is_valid_hash(data):
            hash_value = data.lower()
        else:
            hash_value = sha256(data)
    elif isinstance(data, bytes):
        hash_value = sha256(data)
    else:
        hash_value = hash_file(data)

    client = get_client()
    result = await client.post("/api/verify", {"hash": hash_value})

    if not result.ok:
        return result  # type: ignore

    data_resp = result.value
    exists = data_resp.get("status") == "found" and len(data_resp.get("claims", [])) > 0
    first_claim = data_resp.get("claims", [None])[0] if exists else None

    claim = None
    if first_claim:
        claim = TimestampClaim(
            receipt_id=first_claim["receipt_id"],
            hash=first_claim["hash"],
            created_at=first_claim["created_at"],
            proof_url=f"https://otrust.eu/proof/{first_claim['receipt_id']}",
            blockchain_status="confirmed" if first_claim.get("blockchain_status") == "confirmed" else "pending",
            block_number=first_claim.get("block_number"),
            tx_hash=first_claim.get("tx_hash"),
        )

    return ok(VerifyResult(exists=exists, claim=claim))


async def verify_bulk(hashes: list[str]) -> Result[BulkVerifyResult, OTrustError]:
    """
    Verify multiple hashes at once (max 100).

    Args:
        hashes: List of SHA-256 hashes to verify

    Returns:
        Result with BulkVerifyResult on success

    Example:
        >>> result = await timestamp.verify_bulk([hash1, hash2, hash3])
    """
    if not hashes:
        return ok(BulkVerifyResult(results=[]))

    if len(hashes) > 100:
        return err(OTrustError(
            code="validation_error",
            message="Maximum 100 hashes per request",
        ))

    invalid = [h for h in hashes if not is_valid_hash(h)]
    if invalid:
        return err(OTrustError(
            code="validation_error",
            message=f"Invalid hash format: {invalid[0]}",
        ))

    client = get_client()
    result = await client.post("/api/verify/bulk", {
        "hashes": [h.lower() for h in hashes]
    })

    if not result.ok:
        return result  # type: ignore

    return ok(BulkVerifyResult(results=result.value.get("results", [])))


async def get_proof(receipt_id: str) -> Result[TimestampClaim, OTrustError]:
    """
    Get proof details by receipt ID.

    Args:
        receipt_id: Receipt ID (e.g., "ot_abc123")

    Returns:
        Result with TimestampClaim on success
    """
    client = get_client()
    result = await client.get(f"/api/proof/{receipt_id}")

    if not result.ok:
        return result  # type: ignore

    data = result.value
    return ok(TimestampClaim(
        receipt_id=data["receipt_id"],
        hash=data["hash"],
        created_at=data["created_at"],
        proof_url=data.get("proof_url", f"https://otrust.eu/proof/{data['receipt_id']}"),
        blockchain_status="confirmed" if data.get("blockchain_status") == "confirmed" else "pending",
        block_number=data.get("block_number"),
        tx_hash=data.get("tx_hash"),
    ))


async def lookup(hash_value: str) -> Result[dict, OTrustError]:
    """
    Quick lookup if a hash exists.

    Args:
        hash_value: SHA-256 hash to look up

    Returns:
        Result with {'exists': bool, 'receipt_id': str | None}
    """
    if not is_valid_hash(hash_value):
        return err(OTrustError(
            code="validation_error",
            message="Invalid hash format. Expected 64-character hex string.",
        ))

    client = get_client()
    result = await client.get(f"/api/lookup/{hash_value.lower()}")

    if not result.ok:
        return result  # type: ignore

    data = result.value
    return ok({
        "exists": data.get("exists", False),
        "receipt_id": data.get("receipt_id"),
    })


def hash(
    data: str | bytes | Path | BinaryIO,
    on_progress: Callable[[float], None] | None = None,
) -> str:
    """
    Hash data or file (sync function).

    Args:
        data: Data to hash
        on_progress: Progress callback for files (0.0 to 1.0)

    Returns:
        SHA-256 hash as 64-character hex string

    Example:
        >>> hash("Hello")
        'dffd6021...'
        >>> hash(Path("large.zip"), lambda p: print(f"{p*100:.0f}%"))
    """
    if isinstance(data, Path):
        if on_progress:
            return hash_file_with_progress(data, on_progress)
        return hash_file(data)
    elif isinstance(data, str):
        return sha256(data)
    elif isinstance(data, bytes):
        return sha256(data)
    else:
        return hash_file(data)
