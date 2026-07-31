# OTRUST API policy

This policy defines the stability and reliability contract for the OTRUST HTTP
API. The OpenAPI document at `/openapi.json` is the authoritative endpoint and
schema reference.

## Compatibility

- Existing versioned routes under `/api/v1` remain backward compatible.
- New response properties and new endpoints may be added without a version
  change. Clients must ignore unknown response properties.
- Removing or changing an existing field, status code, or endpoint requires a
  new API version.
- Deprecated behavior will remain available for at least six months after a
  dated deprecation notice is published.
- A capability may be retired immediately when keeping it active would expose
  private data, accept unverifiable security claims, or preserve an exploitable
  authentication contract. The replacement and failure response must be
  documented in OpenAPI and release notes.

## Request identity

Every response includes `X-Request-ID`. Error responses also include the same
value as `request_id` in the JSON body. Send that identifier when reporting an
API problem.

## Idempotent writes

Clients should send an `Idempotency-Key` header on `POST`, `PUT`, and `PATCH`
requests. Official SDKs generate one automatically and reuse it for retries.

- Keys must be 8-128 characters containing letters, numbers, `.`, `_`, or `-`.
- A completed response is retained for 24 hours and replayed with
  `Idempotency-Replayed: true`.
- Reusing a key with a different request returns `409 idempotency_conflict`.
- A concurrent request with the same key returns
  `409 idempotency_in_progress` and `Retry-After`.
- Idempotency storage failures return `503`; a write is not executed without a
  valid reservation.

Keys are scoped to the organization, or to the client address for unauthenticated
routes, plus HTTP method and route.

## Retries and rate limits

Clients may retry network failures, `429`, `5xx`, and
`409 idempotency_in_progress`. Respect `Retry-After` when present and otherwise
use bounded exponential backoff. Do not retry other `4xx` responses without
changing the request.

Rate-limited responses expose standard `RateLimit`, `RateLimit-Policy`, and
`Retry-After` headers.

## Pagination

List endpoints use opaque cursor pagination:

- `limit` is clamped to the documented endpoint maximum.
- `cursor` is the `next_cursor` value returned by the previous page.
- Clients must not parse, modify, or persist assumptions about cursor contents.
- Invalid or expired cursors return `400 invalid_cursor`.

## Canonical origin

The production API origin is `https://www.otrust.eu`. Requests to the apex
domain are redirected to the canonical origin. Redirects for write methods use
HTTP 308 so the method and body are preserved.
