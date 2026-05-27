# Security Policy

## Reporting a Vulnerability

Please do not open a public GitHub issue for a vulnerability.

Send a private report to:

```text
security@otrust.eu
```

Include:

- A short summary of the issue.
- Affected package, file, endpoint, or flow.
- Reproduction steps or proof of concept.
- Impact assessment.
- Any suggested fix or mitigation.

## Scope

In scope:

- SDK code in `sdk-js`, `sdk-python`, and `sdk-react`.
- CLI code in `cli`.
- Cryptographic helper code in `src`.
- Circom source circuits in `circuits`.
- Browser extension source in `addons/browser-extension`.

Out of scope:

- Social engineering.
- Denial-of-service against public services.
- Reports that require access to private OTRUST systems.
- Issues in third-party services unless they directly affect OTRUST code.

## Supported Versions

The default branch is the supported development line. Package-level releases will document support windows when formal release channels are published.

## Security Notes

- Do not commit private keys, API tokens, `.env` files, generated proving keys, or production configuration.
- Treat generated proof secrets as sensitive user data.
- Verify all callback URLs and state parameters in authentication flows.
- Do not run admin or service credentials in browser code.
