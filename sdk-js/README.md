# @otrust/sdk

Official TypeScript SDK for OTRUST timestamping, signing, browser-generated
range-proof submission, and issuer-gated authentication.

## Production status

- Timestamp and Sign are available.
- Age and income proofs must be generated locally with OTRUST's published
  Groth16 artifacts. The SDK accepts only the resulting proof, public signals,
  and commitment.
- Range-proof publishing fails closed in production until the public trusted
  setup ceremony is complete.
- Auth challenge creation fails closed until a trusted credential issuer is
  configured.
- Self-attested identity registration, server-side private proof generation,
  membership proofs, client-driven revocation, and client-supplied backup email
  are retired.

Check `GET /health` before enabling proof publishing or Auth in a production UI.

## Installation

```bash
npm install @otrust/sdk
```

Node.js 18 or newer is required.

## Configuration

```typescript
import { configure } from '@otrust/sdk';

configure({
  baseUrl: 'https://www.otrust.eu',
});
```

The public service is the default. Configure another base URL for a self-hosted
deployment.

## Result values

SDK operations return a `Result<T>` instead of throwing for expected API
failures:

```typescript
import { timestamp } from '@otrust/sdk';

const result = await timestamp.create(file);

if (result.ok) {
  console.log(result.value.receiptId);
} else {
  console.error(result.error.code, result.error.message);
}
```

Use `isOk`, `isErr`, `unwrap`, `unwrapOr`, `map`, and `mapErr` when they fit your
application.

## Timestamp

```typescript
import { timestamp } from '@otrust/sdk';

const created = await timestamp.create(file);
const verified = await timestamp.verify(file);
const storedProof = await timestamp.getProof('ot_abc123');
const lookup = await timestamp.lookup(
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
);
```

Receipt lists are intentionally client-side. Persist receipt IDs in your own
browser storage or database. `GET /receipts/:pubkey` is retired.

## Sign

```typescript
import { sign } from '@otrust/sdk';

const result = await sign.create(file, {
  title: 'Contract Agreement',
  creatorEmail: 'alice@example.com',
  parties: [
    { email: 'bob@example.com', name: 'Bob', role: 'signer' },
    { email: 'carol@example.com', name: 'Carol', role: 'approver' },
  ],
  deadline: '7d',
});

if (result.ok) {
  console.log(result.value.requestId);
}
```

OTRUST Sign records Ed25519 attestations over document hashes. It does not turn
an unverified identity claim into a verified signer identity. Legal effect
depends on the workflow and jurisdiction.

## Proof

Generate the proof in the user's browser with the artifacts published by the
OTRUST Proof Lab. Never send the date of birth, exact income, witness, randomness,
or other private circuit input to the API.

```typescript
import { proof } from '@otrust/sdk';

const submitted = await proof.submitBrowserProof({
  proofType: 'age',
  version: 'groth16-v3',
  proof: groth16Proof,
  publicSignals,
  commitment: publicSignals[5],
});

if (submitted.ok) {
  console.log(submitted.value.proofId);
  console.log(submitted.value.shareUrl);
}

const details = await proof.get('id_abc123');
const verification = await proof.verify('id_abc123');
```

The submission method uses a strict payload allowlist. A valid range proof
establishes consistency with a committed private value; it does not establish
that a government, employer, bank, or other trusted issuer checked that value.

The following compatibility methods fail locally without sending their inputs:

- `proof.identity()`
- `proof.verifyIdentity()`
- `proof.age()`
- `proof.income()`
- `proof.membership()`
- `proof.revoke()`
- `proof.emailBackup()`

## Auth

Create Auth challenges only from a trusted server and only after `/health`
reports that trusted issuer support is ready.

```typescript
import { auth } from '@otrust/sdk';

const state = auth.generateState();
const challenge = await auth.createChallenge({
  clientId: 'my-app',
  redirectUri: 'https://my-app.example/auth/callback',
  scope: ['identity'],
  state,
});

if (challenge.ok) {
  // Redirect in the browser after the server has approved the response.
  window.location.href = challenge.value.loginUrl;
}
```

On callback, compare the returned state with the value stored for the browser
session, then verify the token server-side:

```typescript
const callback = auth.parseCallback(window.location.href);

if (callback.token && callback.state === expectedState) {
  const verified = await auth.verify(callback.token);
}
```

Auth accepts only current trusted issuer-bound identity credentials.
Self-attested range proofs cannot be used for login.

## Security

- Do not log tokens, proof witnesses, private inputs, signing links, or
  cancellation tokens.
- Keep API keys and Auth challenge creation on the server.
- Verify callback state, redirect URI, token expiry, and issuer binding.
- Verify document hashes locally before signing.
- Treat a pending OpenTimestamps receipt differently from a Bitcoin-confirmed
  receipt.
- Pin a reviewed SDK version in production.

Report vulnerabilities privately to `security@otrust.eu`.

## TypeScript

The package includes strict TypeScript declarations and both ESM and CommonJS
builds.

```typescript
import type {
  TimestampClaim,
  SignRequest,
  ProofDetails,
  BrowserProofOptions,
  AuthChallenge,
  Result,
  OTrustError,
} from '@otrust/sdk';
```

## Browser support

The SDK uses Web Crypto and supports modern Chrome, Firefox, Safari, and Edge,
plus Node.js 18+, Deno, Bun, and compatible edge runtimes.

## License

MIT - [OTRUST](https://www.otrust.eu)
