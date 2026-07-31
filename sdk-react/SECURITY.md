# Security Policy

Report vulnerabilities privately to `security@otrust.eu`. Do not publish token,
credential, or private proof data in an issue.

## React integration boundaries

- `<LoginWithOTrust>` creates a registered server challenge and redirects only
  to the URL returned by OTRUST.
- Production Auth remains unavailable until a trusted issuer and exact client
  redirect allowlist are configured.
- Callback state is stored in `sessionStorage` and must match before a token is
  accepted.
- Auth tokens are session-scoped and must still be verified server-side before
  authorizing sensitive actions.
- `<ProofBadge autoVerify={false}>` displays an unchecked state, never a
  verified state.
- A verified range proof is self-attested unless trusted issuer provenance is
  explicitly returned and checked.

Pin reviewed package versions and run:

```bash
npm audit
npm run typecheck
npm test -- --run
npm run build
```
