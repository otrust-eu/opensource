# Security Policy

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, please report them via:
- [GitHub Security Advisories](https://github.com/otrust-eu/core/security/advisories/new)
- Email: security@otrust.eu

You should receive a response within 48 hours. If the issue is confirmed, we will release a patch as soon as possible.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.x.x   | :white_check_mark: |
| 1.x.x   | :x:                |

## Security Features

OTRUST implements defense-in-depth with multiple security layers:

### Transport Security
- **HTTPS Enforced**: Automatic redirect to HTTPS in production
- **HSTS**: 1-year max-age with includeSubDomains and preload
- **TLS**: Railway provides automatic TLS termination

### HTTP Security Headers (via Helmet)
- **Content-Security-Policy**: Strict CSP with allowlist approach
- **X-Frame-Options**: DENY (prevents clickjacking)
- **X-Content-Type-Options**: nosniff (prevents MIME sniffing)
- **X-XSS-Protection**: Enabled
- **Referrer-Policy**: strict-origin-when-cross-origin
- **Cross-Origin-Opener-Policy**: same-origin
- **Cross-Origin-Resource-Policy**: cross-origin (for API access)
- **Permissions-Policy**: Restricts browser features (camera, mic, geolocation, payment, etc.)
- **X-DNS-Prefetch-Control**: Disabled
- **X-Permitted-Cross-Domain-Policies**: none

### Rate Limiting (DDoS/Abuse Prevention)
- **Global**: 1000 requests/15min per IP
- **Claims**: 10 claims/min per IP
- **Challenges**: 30 challenges/min per IP
- **Verification**: 60 requests/min per IP
- **Simple Timestamps**: 10/hour per IP
- **Test Endpoints**: 3 attempts/min per IP
- All rate limiters use IP-based keys via trusted proxy

### CSRF Protection
- Origin header validation for all state-changing requests
- Allowlist of trusted origins
- Chrome extension support
- Security event logging for blocked requests

### Input Validation & Sanitization
- **Hash**: 64 hex characters (SHA-256)
- **Signature**: 128 hex characters (Ed25519)
- **Public Key**: 64/66/130 hex characters (Ed25519/secp256k1)
- **Email**: Validated via `validator` package (strict mode, no IP domains)
- **Filename**: Sanitized, max 255 chars, dangerous chars removed
- **Query Injection**: Structured operators are internal-only; user values are strictly typed and validated
- **JSON Limits**: 1KB for single requests, 1MB for bulk
- **HTTP Parameter Pollution**: Prevented via `hpp` middleware

### Authentication & Secrets
- **Timing-Safe Comparisons**: All secret comparisons use `crypto.timingSafeEqual`
- **No Password Storage**: Zero-knowledge architecture
- **API Keys**: Stored in environment variables only
- **Test Keys**: Required for admin endpoints, rate-limited

### Proof-of-Work (Anti-Spam)
- Required for all claim submissions
- Adaptive difficulty based on server load
- Challenge expiration (5 minutes)
- Single-use challenges (prevents replay attacks)
- Atomic challenge consumption (prevents race conditions)

### Cryptographic Security
- **Ed25519**: Primary signature scheme (256-bit security)
- **secp256k1**: Supported for Ethereum compatibility
- **Random IDs**: `crypto.randomBytes(12).toString('base64url')`
- **All Crypto**: Via `@noble` libraries (audited, no native deps)
- **OpenTimestamps**: RFC 6979 compliant Bitcoin timestamping

### Privacy (Zero-Knowledge)
- **No IP Logging**: Request IDs used for debugging, not IPs
- **No User Accounts**: Public keys are identifiers
- **Email Auto-Delete**: Notification emails deleted after sending
- **Minimal Data**: Only hash, signature, pubkey stored
- **No Analytics**: No tracking pixels or third-party scripts

### Audit Logging (Security Events)
- Rate limit hits logged with request ID
- CSRF blocks logged with origin
- Authentication failures logged
- No PII in logs (no IPs, emails, or user data)

### Error Handling
- **Production**: Generic errors only, no stack traces
- **Request ID**: Included in error responses for support
- **Consistent Format**: All errors are JSON `{error: string, requestId?: string}`

### Caching Security
- **Sensitive Endpoints**: `Cache-Control: no-store` for /claim and /verify
- **Static Assets**: Appropriate caching headers

## Infrastructure Security

### Railway Deployment
- Automatic TLS/SSL
- Persistent volume mounted for the SQLite data directory
- Environment variables for secrets

### SQLite Security
- All user values are bound parameters rather than SQL fragments
- WAL mode, full synchronous writes, and a busy timeout protect durability
- Unique constraints and atomic write transactions protect replay state
- TTL cleanup removes expired challenges, notifications, audit events, and idempotency records

## Known Limitations

### OpenTimestamps Dependencies
The `opentimestamps` npm package has dependencies with known vulnerabilities:
- `form-data`: Prototype pollution (low risk - not user-facing)
- `tough-cookie`: Prototype pollution (low risk - internal HTTP client)
- `qs`: Prototype pollution (low risk - query string parsing)

These affect only the OTS calendar communication layer. The core OTRUST service is not vulnerable. We monitor for updates.

### Trust Model
- Users must trust OTS calendar servers for timestamp aggregation
- Bitcoin confirmation times vary (typically 1-2 hours)
- Proof validity depends on Bitcoin network security
- Email delivery depends on third-party providers (Resend)

## Reporting a Vulnerability

If you discover a security vulnerability, please:

1. **DO NOT** open a public issue
2. Email: security@otrust.eu
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will respond within 48 hours and work with you to resolve the issue.

### Bug Bounty
We appreciate responsible disclosure. Significant vulnerabilities may be eligible for recognition or rewards at our discretion.

## Security Updates

Security patches are released as soon as possible. Subscribe to GitHub releases to stay informed.

## Compliance

While OTRUST is designed with security best practices, it has not undergone formal compliance audits. Consider this when using for regulated use cases.

## Audit Status

- [ ] Formal security audit (planned)
- [x] Internal code review
- [x] Dependency scanning via npm audit
- [x] Automated testing (99 unit tests)
- [x] GitHub Actions CI/CD pipeline
- [x] Security headers verified
