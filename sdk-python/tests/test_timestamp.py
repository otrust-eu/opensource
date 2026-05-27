"""Tests for the OTRUST timestamp service."""

import pytest
from otrust import timestamp


class TestTimestampHash:
    """Test timestamp hash functions."""

    def test_sha256_string(self):
        """Test SHA-256 hashing of a string."""
        result = timestamp.sha256("Hello, World!")
        assert result == "dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f"

    def test_sha256_empty_string(self):
        """Test SHA-256 hashing of an empty string."""
        result = timestamp.sha256("")
        assert result == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

    def test_sha256_bytes(self):
        """Test SHA-256 hashing of bytes."""
        result = timestamp.sha256(b"Hello, World!")
        assert result == "dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f"


class TestIsValidHash:
    """Test hash validation."""

    def test_valid_hash(self):
        """Test validation of a valid SHA-256 hash."""
        valid_hash = "dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f"
        assert timestamp.is_valid_hash(valid_hash) is True

    def test_valid_hash_uppercase(self):
        """Test validation of an uppercase SHA-256 hash."""
        valid_hash = "DFFD6021BB2BD5B0AF676290809EC3A53191DD81C7F70A4B28688A362182986F"
        assert timestamp.is_valid_hash(valid_hash) is True

    def test_invalid_hash_too_short(self):
        """Test validation rejects too short hash."""
        assert timestamp.is_valid_hash("abc123") is False

    def test_invalid_hash_too_long(self):
        """Test validation rejects too long hash."""
        too_long = "a" * 65
        assert timestamp.is_valid_hash(too_long) is False

    def test_invalid_hash_non_hex(self):
        """Test validation rejects non-hex characters."""
        invalid = "gggg6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f"
        assert timestamp.is_valid_hash(invalid) is False

    def test_invalid_hash_empty(self):
        """Test validation rejects empty string."""
        assert timestamp.is_valid_hash("") is False


class TestTimestampModuleExists:
    """Test timestamp module has expected functions."""

    def test_timestamp_has_create(self):
        """Test that timestamp module has create function."""
        assert hasattr(timestamp, 'create')
        assert callable(timestamp.create)

    def test_timestamp_has_verify(self):
        """Test that timestamp module has verify function."""
        assert hasattr(timestamp, 'verify')
        assert callable(timestamp.verify)

    def test_timestamp_has_sha256(self):
        """Test that timestamp module has sha256 function."""
        assert hasattr(timestamp, 'sha256')
        assert callable(timestamp.sha256)

    def test_timestamp_has_is_valid_hash(self):
        """Test that timestamp module has is_valid_hash function."""
        assert hasattr(timestamp, 'is_valid_hash')
        assert callable(timestamp.is_valid_hash)
