# @otrust/sdk

Official SDK for OTRUST - Zero-knowledge timestamping, signing, identity proofs, and authentication.

[![npm version](https://badge.fury.io/js/@otrust%2Fsdk.svg)](https://www.npmjs.com/package/@otrust/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🕐 **Timestamp** - Bitcoin-anchored timestamps via OpenTimestamps
- ✍️ **Sign** - Multi-party document signing with zero-knowledge proofs
- 🔐 **Proof** - Zero-knowledge identity and attribute proofs
- 🚀 **Auth** - "Login with OTRUST" identity-based authentication

## Installation

```bash
npm install @otrust/sdk
# or
pnpm add @otrust/sdk
# or
yarn add @otrust/sdk
```

## Quick Start

```typescript
import { timestamp, sign, proof, auth } from '@otrust/sdk';

// 🕐 Timestamp a file
const result = await timestamp.create(file);
if (result.ok) {
  console.log('Receipt:', result.value.receiptId);
  console.log('Proof URL:', result.value.proofUrl);
}

// ✍️ Create a signing request
const signResult = await sign.create(file, {
  title: 'Contract Agreement',
  creatorEmail: 'alice@example.com',
  parties: [
    { email: 'bob@example.com', name: 'Bob', role: 'signer' },
    { email: 'carol@example.com', name: 'Carol', role: 'approver' },
  ],
  deadline: '7d',
});

// 🔐 Create identity proof
const proofResult = await proof.identity({
  personnummer: '19900101-1234',
  birthDate: '1990-01-01',
  faceMatch: true,
  livenessVerified: true,
});

// IMPORTANT: Store the secret securely!
if (proofResult.ok) {
  console.log('Save this secret:', proofResult.value.secret);
}

// 🚀 Login with OTRUST
const authResult = await auth.createChallenge({
  clientId: 'my-app',
  redirectUri: 'https://my-app.com/callback',
  scope: ['identity'],
});

if (authResult.ok) {
  // Redirect user to login
  window.location.href = authResult.value.loginUrl;
}
```

## Result Types

This SDK uses Result types instead of try/catch for better error handling:

```typescript
import { timestamp, isOk, isErr, unwrap, unwrapOr } from '@otrust/sdk';

const result = await timestamp.create(file);

// Check success
if (result.ok) {
  console.log(result.value.receiptId);
} else {
  console.error(result.error.message);
}

// Or use helper functions
if (isOk(result)) {
  const claim = unwrap(result);
}

// With default value
const receiptId = unwrapOr(result, { receiptId: 'unknown' }).receiptId;
```

## Configuration

```typescript
import { configure } from '@otrust/sdk';

// Configure the SDK (optional - defaults to production)
configure({
  baseUrl: 'https://otrust.eu',  // API base URL
  timeout: 30000,                 // Request timeout in ms
  retries: 3,                     // Number of retry attempts
});
```

## API Reference

### Timestamp Service

```typescript
import { timestamp } from '@otrust/sdk';

// Create timestamp
const result = await timestamp.create(file);
const result = await timestamp.create('data to hash');
const result = await timestamp.create(hash); // if already hashed

// Verify
const result = await timestamp.verify(file);
const result = await timestamp.verify(hash);

// Bulk verify (max 100)
const result = await timestamp.verifyBulk([hash1, hash2, hash3]);

// Get proof
const result = await timestamp.getProof('ot_abc123');

// Quick lookup
const result = await timestamp.lookup(hash);

// Hash with progress
const hash = await timestamp.hash(file, (progress) => {
  console.log(`${Math.round(progress * 100)}%`);
});
```

### Sign Service

```typescript
import { sign } from '@otrust/sdk';

// Create sign request
const result = await sign.create(file, {
  title: 'Contract',
  creatorEmail: 'alice@example.com',
  parties: [
    { email: 'bob@example.com', role: 'signer' },
    { email: 'carol@example.com', role: 'approver' },
  ],
  signingOrder: 'sequential', // or 'parallel'
  deadline: '7d',
});

// Get status
const result = await sign.status('sr_xyz789');

// Cancel
const result = await sign.cancel('sr_xyz789', cancelToken);

// Send reminder
const result = await sign.remind('sr_xyz789', cancelToken);

// Verify document
const result = await sign.verifyDocument('sr_xyz789', file);

// Get signature package
const result = await sign.getPackage('sr_xyz789');
```

### Proof Service

```typescript
import { proof } from '@otrust/sdk';

// Create identity proof
const result = await proof.identity({
  personnummer: '19900101-1234',
  birthDate: '1990-01-01',
  faceMatch: true,
  livenessVerified: true,
});

// Create age proof
const result = await proof.age({
  birthDate: '1990-01-01',
  minAge: 18,
});

// Create membership proof
const result = await proof.membership({
  memberId: 'M12345',
  organizationId: 'org_abc',
  organizationName: 'Example Club',
});

// Get proof
const result = await proof.get('id_abc123');

// Verify proof
const result = await proof.verify('id_abc123');

// Get wallet pass
const result = await proof.wallet('id_abc123', 'apple');

// Revoke (returns recovery token)
const result = await proof.revoke('id_abc123');

// Email backup
await proof.emailBackup({
  email: 'me@example.com',
  proofId: 'id_abc123',
  secret: 'your-secret',
  commitment: 'commitment-hash',
});
```

### Auth Service (Login with OTRUST)

```typescript
import { auth } from '@otrust/sdk';

// Create challenge (server-side)
const result = await auth.createChallenge({
  clientId: 'my-app',
  redirectUri: 'https://my-app.com/callback',
  scope: ['identity'],
  state: auth.generateState(),
});

// Generate login URL (client-side)
const urlResult = await auth.loginUrl({
  clientId: 'my-app',
  redirectUri: 'https://my-app.com/callback',
});

// Verify token (in callback handler)
const { token, state } = auth.parseCallback(window.location.href);
const result = await auth.verify(token);

if (result.ok && result.value.valid) {
  console.log('User proof ID:', result.value.proofId);
}

// Get user info
const result = await auth.userinfo(token);
```

## Crypto Utilities

```typescript
import { sha256, hashFile, isValidHash, randomHex, uuid } from '@otrust/sdk';

// Hash data
const hash = await sha256('Hello, World!');
const fileHash = await hashFile(file);

// Validate hash
if (isValidHash(hash)) {
  // Valid 64-character hex string
}

// Generate random values
const random = randomHex(32); // 64 hex characters
const id = uuid(); // UUID v4
```

## Browser Support

This SDK uses the Web Crypto API and works in:

- ✅ Node.js 18+
- ✅ Deno
- ✅ Bun
- ✅ Modern browsers (Chrome, Firefox, Safari, Edge)
- ✅ Edge runtimes (Cloudflare Workers, Vercel Edge)

## TypeScript

Full TypeScript support with strict types:

```typescript
import type {
  TimestampClaim,
  SignRequest,
  IdentityProof,
  AuthChallenge,
  Result,
  OTrustError,
} from '@otrust/sdk';
```

## License

MIT © [OTRUST](https://otrust.eu)
