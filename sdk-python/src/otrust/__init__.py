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
    >>> # Submit a Groth16 proof generated in a trusted local environment
    >>> result = await proof.submit_browser_proof(
    ...     proof_type="age",
    ...     proof_data=groth16_proof,
    ...     public_signals=public_signals,
    ...     commitment=public_signals[5],
    ... )
    >>> if result.ok:
    ...     print(f"Proof ID: {result.value['proofId']}")
"""

__version__ = "1.0.0"

from . import auth, proof, sign, timestamp
from .client import OTrustClient, configure
from .result import Err, Ok, OTrustError, Result, is_err, is_ok, unwrap, unwrap_or

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
