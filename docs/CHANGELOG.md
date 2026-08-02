# Changelog

All notable changes to OTRUST will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Embedded SQLite storage with MongoDB-compatible collection semantics and persistent Railway volume support.
- Verified MongoDB export importer with Extended JSON support, dry-run mode, integrity checks, collection counts, document identity parity, and migration manifests.
- Explicit API policy covering stable response envelopes, idempotency, cursor pagination, deprecation, and version metadata.
- Browser-local receipt history, bulk verification, usage badges, embed widget, bookmarklet, webhook notifications, and CLI history and IPFS export commands.
- Evidence ZIP bundles, transparency RSS, hash ceremonies, time-locked commitments, partner theme builder, Merkle viewer, SDK receipt watching, GitHub Action, and integration scaffolds.
- Local Poseidon and snarkjs browser bundles with published ZK artifact verification.

### Changed
- Production persistence moved from MongoDB to SQLite at `OTRUST_DB_PATH`; Railway uses `/data/otrust.sqlite` on the `otrust-data` volume.
- OpenTimestamps now uses the pinned `opentimestamps-client` 0.7.2 runtime and submits existing SHA-256 digests to public calendars for Bitcoin anchoring.
- API behavior now includes method-preserving canonical redirects, opaque pagination cursors, scoped API keys, safer idempotency replay, and consistent build metadata.
- Authentication fails closed unless a trusted identity issuer and registered client are configured.
- ZK proof delivery is browser-side and fails closed until verified production artifacts from a completed ceremony are available.
- JavaScript, Python, and React SDKs use explicit result types and aligned authentication, proof, signing, and timestamp contracts.
- Browser extension distribution is available through the Chrome Web Store.
- Public pages and founder material were updated to align product, privacy, research, and prior-art messaging.

### Fixed
- Restored real OpenTimestamps proof creation; the previous integration called unsupported CLI digest flags and the production image did not include the CLI.
- Railway Docker builds now support mounted volumes without declaring an image-level `VOLUME` instruction.
- Migration verification handles production-sized Extended JSON exports without SQLite iterator corruption.
- SDK playground builds are isolated from local workspace dependency trees.
- Core-to-opensource synchronization preserves local `node_modules` directories while removing stale tracked content.
- POST, PUT, PATCH, and DELETE redirects retain their original HTTP method and body.

### Security
- Migration fails closed on incomplete exports, duplicate identities, count mismatches, corrupt JSON, failed SQLite integrity checks, or an existing destination.
- Legacy self-attested identity registration and recovery surfaces were retired.
- Server-side generation of private ZK witness inputs was removed; unverified proofs are rejected.
- API input validation, webhook URL validation, CSRF handling, request metadata, rate limits, and administrative access checks were hardened.
- Vulnerable addon and build dependencies were updated, with CI audits covering root and SDK lockfiles.

### Removed
- MongoDB as an application runtime dependency and the MongoDB service requirement from self-hosted Docker Compose.
- Legacy camera and face-verification code that could not provide issuer-bound identity guarantees.

## [2.0.2] - 2026-01-07

### Added
- API v1 versioning with `/api/v1` endpoint and route aliases.
- Mock database support for `findOneAndUpdate` and `deleteMany`.

### Changed
- Removed emojis from email templates and server responses.
- Removed unused handlers and implementation stubs.

### Fixed
- About page mobile navigation and theme toggle errors.
- Security test expectations for correct 4xx validation responses.

### Security
- Removed debug logging that exposed signing URLs containing access tokens.
- Protected `/api/` endpoints from crawler indexing through `robots.txt`.

## [2.0.1] - 2026-01-06

### Changed
- Replaced regex-based email extraction with bounded string parsing.
- Added type validation before timing-safe comparisons.
- Improved content-type header validation.

### Security
- Fixed type-confusion vulnerabilities in HTTP header handling.
- Fixed denial-of-service risk in email address parsing.
- Fixed incomplete HTML sanitization in the email worker.
- Added type checks and input length limits for user-controlled headers.
- Added explicit permissions to GitHub Actions workflows.
- Resolved CodeQL findings across server and workflow code.

## [1.0.0] - 2026-01-01

### Added
- Initial public release.
- Zero-knowledge timestamping service.
- Ed25519 signatures for proof of authorship.
- Adaptive proof-of-work spam prevention.
- OpenTimestamps integration for blockchain anchoring.
- Web interface with browser-side file hashing.
- CLI, Chrome extension, email timestamping, and REST API.
- MongoDB backend with automatic index management.
- Cloudflare and Railway deployment configuration.

### Security
- Content Security Policy with nonces.
- Origin-based CSRF protection.
- Endpoint rate limiting.
- Input validation and sanitization.
- API-key protection for administrative endpoints.
- No sensitive data logging.

### Infrastructure
- GitHub Actions CI/CD pipeline.
- Unit, integration, and security test suites.
- Automatic deployment from `main`.
