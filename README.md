# OTRUST Open Source

Open source client libraries, command-line tooling, cryptographic helpers, and examples for OTRUST.

OTRUST is trust infrastructure for timestamping, document signing, identity proofs, and hosted verification flows. This repository contains the public developer-facing pieces. It intentionally does not contain private production deployment configuration, partner-specific themes, internal operations code, or service credentials.

## What Is Included

- `sdk-js` - TypeScript SDK for timestamping, signing, proof, auth, and browser-side verification helpers.
- `sdk-python` - Python SDK for server-side and automation use cases.
- `sdk-react` - React components and hooks for OTRUST login, proof badges, signatures, and timestamp widgets.
- `cli` - Local command-line tool for key generation, hashing, timestamping, and verification against the hosted API.
- `src` - Reference cryptographic helpers for Ed25519, secp256k1, SHA-256 hashing, and proof-of-work.
- `circuits` - Circom source circuits for age, income, and membership proof experiments.
- `addons/browser-extension` - Source for the browser extension.
- `examples` - Minimal usage examples.

## What Is Not Included

- Production server internals.
- Deployment files, private infrastructure configuration, or environment secrets.
- Partner-specific hosted login themes or customer pages.
- Operational bots, workers, or admin-only service code.
- Generated build artifacts, proving keys, lockfile noise, and historical git data.

## Quick Start

Install dependencies from the repository root:

```bash
npm install
```

Build the TypeScript packages:

```bash
npm run build
```

Run the core JavaScript tests:

```bash
npm run test:core
```

Use the CLI directly:

```bash
node cli/otrust.js keygen
node cli/otrust.js claim ./document.pdf
node cli/otrust.js verify ./document.pdf
```

## JavaScript SDK

```bash
cd sdk-js
npm install
npm run build
```

```ts
import { timestamp, auth, configure } from '@otrust/sdk';

configure({ baseUrl: 'https://otrust.eu' });

const claim = await timestamp.create(file);
if (claim.ok) {
  console.log(claim.value.receiptId);
}

const login = await auth.createChallenge({
  clientId: 'your-client-id',
  redirectUri: 'https://your-app.example/auth/callback',
  scope: ['identity'],
});
```

## Python SDK

```bash
cd sdk-python
python -m pip install -e ".[dev]"
pytest
```

```python
from otrust import OTrustClient

client = OTrustClient(base_url="https://otrust.eu")
result = client.timestamp.verify_hash("0" * 64)
print(result)
```

## React SDK

```bash
cd sdk-react
npm install
npm run build
```

```tsx
import { OTrustProvider, LoginWithOTrust } from '@otrust/react';

export function Login() {
  return (
    <OTrustProvider clientId="your-client-id" redirectUri="https://your-app.example/callback">
      <LoginWithOTrust />
    </OTrustProvider>
  );
}
```

## Security Model

Client-side hashing means raw files do not need to be uploaded for timestamping. The hosted OTRUST API receives hashes, signatures, proof metadata, and challenge data required for the selected flow.

This repository is MIT licensed, but using the hosted production service is subject to the policies published at https://otrust.eu.

## Maintainer

Maintained by Kris Ledel.

Security reports should be sent privately. See `SECURITY.md`.
