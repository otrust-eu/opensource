"""
Crypto utilities for OTRUST SDK.

Hash functions and cryptographic utilities.
"""

from __future__ import annotations
import hashlib
import secrets
import uuid
from pathlib import Path
from typing import BinaryIO, Callable


def sha256(data: str | bytes) -> str:
    """
    Hash data using SHA-256.

    Args:
        data: String or bytes to hash

    Returns:
        64-character hex string

    Example:
        >>> sha256("Hello, World!")
        'dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f'
    """
    if isinstance(data, str):
        data = data.encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def hash_file(file: str | Path | BinaryIO) -> str:
    """
    Hash a file using SHA-256.

    Args:
        file: File path or file-like object

    Returns:
        64-character hex string

    Example:
        >>> hash_file("document.pdf")
        'a1b2c3d4...'
        >>> with open("document.pdf", "rb") as f:
        ...     hash_file(f)
    """
    h = hashlib.sha256()

    if isinstance(file, (str, Path)):
        with open(file, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
    else:
        for chunk in iter(lambda: file.read(65536), b""):
            h.update(chunk)

    return h.hexdigest()


def hash_file_with_progress(
    file: str | Path,
    on_progress: Callable[[float], None] | None = None,
) -> str:
    """
    Hash a file with progress callback.

    Args:
        file: File path
        on_progress: Callback receiving progress (0.0 to 1.0)

    Returns:
        64-character hex string

    Example:
        >>> def progress(p):
        ...     print(f"{p*100:.1f}%")
        >>> hash_file_with_progress("large_file.zip", progress)
    """
    path = Path(file)
    total_size = path.stat().st_size
    processed = 0
    h = hashlib.sha256()

    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
            processed += len(chunk)
            if on_progress:
                on_progress(processed / total_size if total_size > 0 else 1.0)

    return h.hexdigest()


def is_valid_hash(hash_str: str) -> bool:
    """
    Check if a string is a valid SHA-256 hash.

    Args:
        hash_str: String to validate

    Returns:
        True if valid 64-character hex string

    Example:
        >>> is_valid_hash("a1b2c3" * 10 + "a1b2")
        True
        >>> is_valid_hash("not-a-hash")
        False
    """
    if len(hash_str) != 64:
        return False
    try:
        int(hash_str, 16)
        return True
    except ValueError:
        return False


def random_hex(length: int = 32) -> str:
    """
    Generate random hex string.

    Args:
        length: Number of bytes (output will be 2x characters)

    Returns:
        Random hex string

    Example:
        >>> random_hex(16)
        'a1b2c3d4e5f6...' (32 characters)
    """
    return secrets.token_hex(length)


def generate_uuid() -> str:
    """
    Generate a random UUID v4.

    Returns:
        UUID string

    Example:
        >>> generate_uuid()
        'f47ac10b-58cc-4372-a567-0e02b2c3d479'
    """
    return str(uuid.uuid4())


def bytes_to_hex(data: bytes) -> str:
    """Convert bytes to hex string."""
    return data.hex()


def hex_to_bytes(hex_str: str) -> bytes:
    """Convert hex string to bytes."""
    return bytes.fromhex(hex_str)
