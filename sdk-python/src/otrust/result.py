"""
Result types for OTRUST SDK.

Provides Ok/Err types for explicit error handling without exceptions.
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import TypeVar, Generic, Union, Callable, Any

T = TypeVar("T")
E = TypeVar("E")
U = TypeVar("U")


class OTrustError(Exception):
    """Base error class for OTRUST SDK."""

    def __init__(self, code: str, message: str, status: int = 0, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.details = details or {}

    def __repr__(self) -> str:
        return f"OTrustError(code={self.code!r}, message={self.message!r})"


@dataclass(frozen=True)
class Ok(Generic[T]):
    """Represents a successful result."""

    value: T
    ok: bool = True

    def __bool__(self) -> bool:
        return True


@dataclass(frozen=True)
class Err(Generic[E]):
    """Represents an error result."""

    error: E
    ok: bool = False

    def __bool__(self) -> bool:
        return False


# Type alias for Result
Result = Union[Ok[T], Err[E]]


def is_ok(result: Result[T, E]) -> bool:
    """Check if result is Ok."""
    return isinstance(result, Ok)


def is_err(result: Result[T, E]) -> bool:
    """Check if result is Err."""
    return isinstance(result, Err)


def unwrap(result: Result[T, OTrustError]) -> T:
    """
    Get the value from Ok, or raise the error from Err.

    Example:
        >>> result = Ok(42)
        >>> unwrap(result)
        42
        >>> result = Err(OTrustError("test", "error"))
        >>> unwrap(result)  # raises OTrustError
    """
    if isinstance(result, Ok):
        return result.value
    raise result.error


def unwrap_or(result: Result[T, E], default: T) -> T:
    """
    Get the value from Ok, or return default if Err.

    Example:
        >>> result = Ok(42)
        >>> unwrap_or(result, 0)
        42
        >>> result = Err(OTrustError("test", "error"))
        >>> unwrap_or(result, 0)
        0
    """
    if isinstance(result, Ok):
        return result.value
    return default


def map_result(result: Result[T, E], fn: Callable[[T], U]) -> Result[U, E]:
    """
    Transform the Ok value, leave Err unchanged.

    Example:
        >>> result = Ok(5)
        >>> mapped = map_result(result, lambda x: x * 2)
        >>> mapped.value
        10
    """
    if isinstance(result, Ok):
        return Ok(fn(result.value))
    return result  # type: ignore


def and_then(result: Result[T, E], fn: Callable[[T], Result[U, E]]) -> Result[U, E]:
    """
    Chain operations that return Results.

    Example:
        >>> def double_if_positive(x: int) -> Result[int, str]:
        ...     if x > 0:
        ...         return Ok(x * 2)
        ...     return Err("negative")
        >>> result = Ok(5)
        >>> chained = and_then(result, double_if_positive)
        >>> chained.value
        10
    """
    if isinstance(result, Ok):
        return fn(result.value)
    return result  # type: ignore


def ok(value: T) -> Ok[T]:
    """Create an Ok result."""
    return Ok(value)


def err(error: E) -> Err[E]:
    """Create an Err result."""
    return Err(error)
