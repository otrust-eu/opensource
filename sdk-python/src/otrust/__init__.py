"""
OTRUST SDK for Python

Official Python SDK for OTRUST - Zero-knowledge timestamps, signing, proofs, and authentication.

Example usage:
    >>> from otrust import timestamp, sign, proof, auth
    >>> 
    >>> # Create timestamp
    >>> result = await timestamp.create("Hello, World!")
    >>> if result.ok:
    ...     print(f"Receipt: {result.value.receipt_id}")
    >>> 
    >>> # Create identity proof
    >>> result = await proof.identity(
    ...     personnummer="19900101-1234",
    ...     birth_date="1990-01-01",
    ...     face_match=True,
    ...     liveness_verified=True,
    ... )
    >>> if result.ok:
    ...     print(f"Proof ID: {result.value.proof_id}")
    ...     print(f"Secret: {result.value.secret}")  # Store securely!
"""

__version__ = "1.0.0"

from .client import configure, OTrustClient
from .result import Ok, Err, Result, OTrustError, is_ok, is_err, unwrap, unwrap_or
from . import timestamp
from . import sign
from . import proof
from . import auth

__all__ = [
    # Version
    "__version__",
    # Client
    "configure",
    "OTrustClient",
    # Result types
    "Ok",
    "Err",
    "Result",
    "OTrustError",
    "is_ok",
    "is_err",
    "unwrap",
    "unwrap_or",
    # Services
    "timestamp",
    "sign",
    "proof",
    "auth",
]
