# @otrust/react

React components and hooks for OTRUST timestamping, proof verification, and
issuer-gated Auth.

## Installation

```bash
npm install @otrust/react @otrust/sdk
```

## Provider

```tsx
import { OTrustProvider } from '@otrust/react';

<OTrustProvider
  config={{
    clientId: 'my-app',
    redirectUri: 'https://my-app.example/auth/callback',
  }}
>
  <App />
</OTrustProvider>
```

## Auth

```tsx
import { LoginWithOTrust } from '@otrust/react';

<LoginWithOTrust
  onError={error => console.error(error.message)}
/>
```

The button requests a registered server challenge and redirects only to the URL
returned by OTRUST. Production Auth fails closed until a trusted issuer and
client redirect allowlist are configured.

## Proof badge

```tsx
import { ProofBadge } from '@otrust/react';

<ProofBadge proofId="prf_abc123" autoVerify />
```

With `autoVerify={false}`, the badge is explicitly unchecked. A valid range
proof does not by itself establish trusted issuer provenance.

## License

MIT
