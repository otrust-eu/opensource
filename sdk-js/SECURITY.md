# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.x | Yes |

## Report a vulnerability

Do not open a public issue for a suspected vulnerability. Email
`security@otrust.eu` with the affected version, impact, and reproduction steps.

## Security boundaries

### Authentication

- Generate a cryptographically random state value for every Auth attempt.
- Store browser-session state in `sessionStorage`, not `localStorage`.
- Compare callback state before accepting or verifying a token.
- Create challenges and verify tokens from a trusted server.
- Check token expiry, redirect URI, challenge binding, credential binding, and
  current trusted issuer status.
- Production challenge creation remains unavailable until a trusted issuer is
  configured.

### Proofs

- Generate range proofs locally with the published OTRUST circuit artifacts.
- Never add a date of birth, exact income, witness, randomness, or another
  private circuit input to the submission payload.
- Submit only `proofType`, `version`, `proof`, `publicSignals`, and `commitment`.
- Treat range proofs as self-attested unless a separate trusted issuer binding is
  explicitly present and verified.
- Production publishing remains unavailable until the public trusted-setup
  ceremony and artifact checks are complete.

```typescript
await proof.submitBrowserProof({
  proofType: 'age',
  version: 'groth16-v3',
  proof: groth16Proof,
  publicSignals,
  commitment: publicSignals[5],
});
```

### Timestamping and signing

- Hash documents locally and verify the hash immediately before signing.
- Keep signing links, cancellation tokens, API keys, and private keys out of
  logs and client bundles.
- Distinguish an OpenTimestamps receipt that is pending from one independently
  verified against Bitcoin.
- OTRUST Sign creates Ed25519 attestations over document hashes; identity and
  legal assurance depend on the surrounding workflow.

### Transport and browser policy

- Use HTTPS in production.
- Restrict `connect-src` to the OTRUST origin you use.
- Do not load proof artifacts or SDK bundles from unreviewed third-party origins.
- Pin reviewed dependency and SDK versions.

Example baseline:

```text
Content-Security-Policy:
  default-src 'self';
  connect-src 'self' https://www.otrust.eu;
  script-src 'self';
  object-src 'none';
  base-uri 'self';
  frame-ancestors 'none'
```

## Dependency checks

Run these checks before release:

```bash
npm audit
npm run typecheck
npm run test:run
npm run build
```
