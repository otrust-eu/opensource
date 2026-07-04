# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in `@otrust/sdk`, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email security@otrust.eu with details
3. Include steps to reproduce if possible
4. We will respond within 48 hours

## Security Features

### Authentication

- **CSRF Protection**: All auth flows use cryptographically random state parameters (128-bit via `crypto.getRandomValues()`)
- **Token Storage**: Tokens stored in `sessionStorage` (not `localStorage`) - limited to browser session
- **State Verification**: Callback handlers verify state matches to prevent CSRF attacks

### Cryptography

- **Hashing**: SHA-256 via Web Crypto API
- **Signatures**: Ed25519 via Web Crypto API
- **Random Generation**: `crypto.getRandomValues()` for all security-sensitive randomness

### Input Validation

- **Hash Validation**: Strict regex `/^[a-f0-9]{64}$/i` for SHA-256 hashes
- **URL Parsing**: Safe URL parsing with try/catch, no unsafe string concatenation

### Error Handling

- **No Sensitive Data Exposure**: Error messages do not leak internal server details
- **Result Types**: Predictable error handling without exceptions

## Best Practices for SDK Users

### Secure Token Handling

```typescript
// ✅ Good - tokens cleared on logout
const { logout } = useAuth();
logout(); // Clears sessionStorage

// ❌ Bad - never log tokens
console.log(token); // Don't do this!
```

### Protect Your Secrets

```typescript
// ✅ Good - store proof secrets securely
const result = await proof.identity({ ... });
if (result.ok) {
  // Store secret in secure storage (e.g., encrypted database)
  await secureStorage.set('proof_secret', result.value.secret);
}

// ❌ Bad - never expose secrets
localStorage.setItem('secret', secret); // Don't do this!
```

### CSRF Protection

```typescript
// ✅ Good - always verify state
const { handleCallback } = useAuth();
const success = await handleCallback(); // Verifies state automatically

// ✅ Good - use provided state generator
const state = auth.generateState();
```

### Content Security Policy

Recommended CSP headers for your application:

```
Content-Security-Policy: 
  default-src 'self';
  connect-src 'self' https://otrust.eu;
  script-src 'self';
  style-src 'self' 'unsafe-inline';
```

## Dependency Security

We regularly audit dependencies using:
- `pnpm audit` for JavaScript packages
- Dependabot for automated security updates

### Known Issues

| Package | Severity | Status |
|---------|----------|--------|
| esbuild | Moderate | Dev dependency only - no production impact |

## Security Audit History

| Date | Auditor | Scope | Result |
|------|---------|-------|--------|
| 2026-01-08 | Internal | Full SDK review | ✅ Passed |

## Changelog

### v1.0.0
- Replaced all `dangerouslySetInnerHTML` with safe React components
- Implemented CSRF state verification in auth hooks
- Added input validation for all user-provided data
