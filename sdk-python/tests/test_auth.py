"""Tests for the OTRUST auth service."""

import pytest
import secrets
from otrust import auth


class TestAuthCreateChallenge:
    """Test auth.create_challenge."""

    def test_create_challenge_returns_string(self):
        """Test that create_challenge returns a hex string."""
        challenge = auth.create_challenge()
        assert isinstance(challenge, str)
        assert len(challenge) > 0


class TestAuthLoginUrl:
    """Test auth.login_url."""

    def test_login_url_returns_string(self):
        """Test that login_url returns a URL string."""
        url = auth.login_url(
            client_id="test-app",
            redirect_uri="https://myapp.com/callback"
        )
        assert isinstance(url, str)
        assert url.startswith("https://")
        assert "client_id=test-app" in url
        assert "redirect_uri=" in url

    def test_login_url_includes_scope(self):
        """Test that login_url includes scope."""
        url = auth.login_url(
            client_id="test-app",
            redirect_uri="https://myapp.com/callback",
            scope="identity age:18"
        )
        assert "scope=" in url


class TestAuthParseCallback:
    """Test auth.parse_callback."""

    def test_parse_callback_extracts_params(self):
        """Test that parse_callback extracts params from URL."""
        # First store the state
        state = "state_456"
        auth._state_store[state] = state
        
        result = auth.parse_callback(
            "https://myapp.com/callback?code=auth_code_123&state=state_456"
        )
        assert result is not None
        # Should have either code or error
        assert "code" in result or "error" in result


class TestAuthVerifyState:
    """Test auth.verify_state."""

    def test_verify_state_rejects_invalid(self):
        """Test that verify_state rejects invalid state."""
        assert auth.verify_state("invalid-random-state") is False

    def test_verify_state_validates_stored_state(self):
        """Test that verify_state validates stored state."""
        # Generate a state and store it
        state = secrets.token_hex(16)
        auth._state_store[state] = state
        
        # Should verify successfully
        assert auth.verify_state(state) is True


class TestAuthClearState:
    """Test auth.clear_state."""

    def test_clear_state_removes_state(self):
        """Test that clear_state removes stored state."""
        state = secrets.token_hex(16)
        auth._state_store[state] = state
        
        auth.clear_state(state)
        
        assert state not in auth._state_store

