# Security Policy

Report vulnerabilities privately to `security@otrust.eu`. Do not open a public
issue containing exploit details or private data.

## Boundaries

- Generate range proofs locally and submit only the proof, public signals,
  commitment, type, and version.
- Never send a date of birth, exact income, witness, or proof randomness.
- Treat range proofs as self-attested unless a separate trusted issuer binding
  is explicitly verified.
- Create Auth challenges on a trusted server.
- Use the exact `login_url` returned by the challenge endpoint.
- Store and compare state in the caller's own session.
- Verify Auth tokens and current trusted issuer status before creating an
  application session.
- Verify document hashes locally before signing.
- Distinguish pending timestamp receipts from Bitcoin-confirmed receipts.

## Release checks

```bash
ruff check .
mypy src
pytest
```
