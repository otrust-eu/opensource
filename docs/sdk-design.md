# OTRUST SDK Design Document

**Author:** Kris Ledel
**Version:** 1.0.0
**Date:** January 2026

## Overview

The OTRUST SDK provides developers with easy-to-use client libraries for interacting with the OTRUST blind notary service. The SDK will be available in two primary languages:

1. **JavaScript/TypeScript** (Primary) - For Node.js, browsers, and Deno
2. **Python** - For data science, automation, and backend integration

## Core Features

### 1. Timestamp Service
- Create timestamped claims for document hashes
- Verify existing claims
- Retrieve OpenTimestamps proof files
- Bulk verification support

### 2. Sign Service
- Create multi-party signing requests
- Track signing progress
- Handle notifications
- Cancel/manage signing workflows

### 3. Proof Service
- Generate shareable proof pages
- Export proof certificates (PDF)
- Embed proof verification widgets

### 4. Proof-as-Auth (NEW)
A revolutionary authentication flow where users prove document ownership to authenticate with third-party services.

---

## JavaScript/TypeScript SDK

### Installation

```bash
npm install @otrust/sdk
# or
yarn add @otrust/sdk
```

### Basic Usage

```typescript
import { OTrust } from '@otrust/sdk';

// Initialize client
const otrust = new OTrust({
  baseUrl: 'https://otrust.eu', // Default production URL
  apiVersion: 'v1',
});

// Create a timestamp claim
const claim = await otrust.timestamp.create({
  hash: 'sha256-hash-of-document',
  source: 'my-app',
});

console.log(claim.receipt_id); // ts_abc123...
console.log(claim.proof_url);  // https://otrust.eu/proof/ts_abc123

// Verify a hash
const verification = await otrust.timestamp.verify({
  hash: 'sha256-hash-of-document',
});

if (verification.exists) {
  console.log(`Timestamped at: ${verification.created_at}`);
  console.log(`Blockchain status: ${verification.blockchain_status}`);
}
```

### Advanced: Signed Claims with Ed25519

```typescript
import { OTrust, generateKeypair, sign } from '@otrust/sdk';

// Generate or load keypair
const { privateKey, publicKey } = generateKeypair('ed25519');

// Create signed claim
const signature = await sign(hash, privateKey);

const claim = await otrust.timestamp.create({
  hash,
  pubkey: publicKey,
  signature,
});

// Claim is now cryptographically linked to your identity
```

### Sign Service

```typescript
// Create a signing request
const signRequest = await otrust.sign.create({
  documentHash: 'sha256-hash',
  documentName: 'Contract.pdf',
  creatorEmail: 'alice@example.com',
  parties: [
    { email: 'bob@example.com', name: 'Bob Smith' },
    { email: 'carol@example.com', name: 'Carol Jones' },
  ],
  expiresIn: '7d', // Optional: 7 days to sign
});

console.log(signRequest.request_id);  // sr_xyz789...
console.log(signRequest.status_url);  // URL to track progress

// Check status
const status = await otrust.sign.status(signRequest.request_id);
console.log(status.completed_count);
console.log(status.pending_parties);
```

### Proof-as-Auth Flow

A revolutionary pattern for third-party authentication using document ownership.

```typescript
// 1. Third-party service requests proof
const challenge = await otrust.auth.createChallenge({
  documentHash: 'sha256-of-important-document',
  service: 'example.com',
  scope: ['read:profile', 'verify:ownership'],
});

// 2. User proves ownership (in their app)
const proof = await otrust.auth.proveOwnership({
  challengeId: challenge.id,
  hash: 'sha256-of-important-document',
  privateKey: userPrivateKey,
});

// 3. Third-party service verifies the proof
const verified = await otrust.auth.verifyProof({
  proofToken: proof.token,
  expectedHash: 'sha256-of-important-document',
});

if (verified.valid) {
  // User has proven they timestamped this document
  // Grant access based on document ownership
}
```

### Browser Integration

```typescript
// In browser environments
import { OTrust } from '@otrust/sdk/browser';

// File hashing helper
const hash = await OTrust.hashFile(fileInput.files[0]);

// Create claim from browser
const claim = await otrust.timestamp.create({ hash });

// Open proof in new tab
OTrust.openProof(claim.receipt_id);
```

### React Components (Optional Package)

```typescript
import { ProofBadge, TimestampWidget } from '@otrust/sdk/react';

// Display proof badge
<ProofBadge receiptId="ts_abc123" variant="minimal" />

// Interactive timestamp widget
<TimestampWidget
  hash={documentHash}
  onTimestamped={(claim) => console.log('Created:', claim)}
/>
```

---

## Python SDK

### Installation

```bash
pip install otrust
```

### Basic Usage

```python
from otrust import OTrust

# Initialize client
client = OTrust(
    base_url="https://otrust.eu",
    api_version="v1"
)

# Create a timestamp claim
claim = client.timestamp.create(
    hash="sha256-hash-of-document",
    source="my-python-app"
)

print(claim.receipt_id)  # ts_abc123...
print(claim.proof_url)   # https://otrust.eu/proof/ts_abc123

# Verify a hash
verification = client.timestamp.verify(hash="sha256-hash-of-document")

if verification.exists:
    print(f"Timestamped at: {verification.created_at}")
    print(f"Blockchain status: {verification.blockchain_status}")
```

### File Hashing Utility

```python
from otrust import hash_file

# Hash any file
file_hash = hash_file("/path/to/document.pdf")

# Create claim
claim = client.timestamp.create(hash=file_hash)
```

### Signed Claims with Ed25519

```python
from otrust import OTrust, generate_keypair, sign

# Generate keypair
private_key, public_key = generate_keypair("ed25519")

# Sign and create claim
signature = sign(hash, private_key)

claim = client.timestamp.create(
    hash=hash,
    pubkey=public_key,
    signature=signature
)
```

### Async Support

```python
import asyncio
from otrust import AsyncOTrust

async def main():
    client = AsyncOTrust()

    # Bulk verification
    hashes = ["hash1", "hash2", "hash3"]
    results = await client.timestamp.verify_bulk(hashes)

    for result in results:
        print(f"{result.hash}: {result.status}")

asyncio.run(main())
```

### Django/Flask Integration

```python
# Django middleware example
from otrust.django import OTrustMiddleware

MIDDLEWARE = [
    # ...
    'otrust.django.OTrustMiddleware',
]

OTRUST = {
    'BASE_URL': 'https://otrust.eu',
    'VERIFY_ON_UPLOAD': True,
}
```

### CLI Tool

```bash
# Timestamp a file
otrust timestamp document.pdf

# Verify a hash
otrust verify a7d3f...

# Get proof
otrust proof ts_abc123 --output proof.ots

# Open proof page
otrust proof ts_abc123 --browser
```

---

## Proof-as-Auth Protocol Specification

### Overview

Proof-as-Auth enables third-party authentication based on document ownership. Instead of traditional OAuth where users grant access to their accounts, Proof-as-Auth lets users prove they own specific timestamped documents.

### Use Cases

1. **Document Verification Services** - Prove you created a document
2. **IP Protection** - Prove prior art for patents/designs
3. **Credential Verification** - Prove you hold certain certificates
4. **Secure File Sharing** - Grant access only to document owners

### Protocol Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Service   │     │    User     │     │   OTRUST    │
│  (Relying   │     │   (Owner)   │     │   Server    │
│   Party)    │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       │  1. Request Proof │                   │
       │  (document hash)  │                   │
       │──────────────────>│                   │
       │                   │                   │
       │                   │ 2. Sign Challenge │
       │                   │ (with private key)│
       │                   │──────────────────>│
       │                   │                   │
       │                   │ 3. Proof Token    │
       │                   │<──────────────────│
       │                   │                   │
       │  4. Submit Proof  │                   │
       │<──────────────────│                   │
       │                   │                   │
       │  5. Verify Proof  │                   │
       │──────────────────────────────────────>│
       │                   │                   │
       │  6. Verification  │                   │
       │     Result        │                   │
       │<──────────────────────────────────────│
       │                   │                   │
       │  7. Grant Access  │                   │
       │──────────────────>│                   │
       │                   │                   │
```

### API Endpoints

#### Create Auth Challenge
```
POST /api/v1/auth/challenge
{
  "document_hash": "sha256-hash",
  "service_id": "example.com",
  "scope": ["verify:ownership"],
  "ttl": 300
}
```

#### Prove Ownership
```
POST /api/v1/auth/prove
{
  "challenge_id": "ch_...",
  "pubkey": "user-public-key",
  "signature": "signature-of-challenge"
}
```

#### Verify Proof Token
```
POST /api/v1/auth/verify
{
  "proof_token": "pt_...",
  "expected_hash": "sha256-hash"
}
```

### Security Considerations

1. **Challenge Expiration** - Challenges expire in 5 minutes
2. **One-Time Use** - Each challenge can only be used once
3. **Hash Binding** - Proof is bound to specific document hash
4. **Service Binding** - Proof is bound to requesting service
5. **No Private Key Exposure** - Only signatures are transmitted

---

## SDK Architecture

### Package Structure

```
@otrust/sdk/
├── src/
│   ├── index.ts           # Main exports
│   ├── client.ts          # HTTP client
│   ├── timestamp/         # Timestamp service
│   │   ├── index.ts
│   │   └── types.ts
│   ├── sign/              # Sign service
│   │   ├── index.ts
│   │   └── types.ts
│   ├── proof/             # Proof service
│   │   ├── index.ts
│   │   └── types.ts
│   ├── auth/              # Proof-as-Auth
│   │   ├── index.ts
│   │   └── types.ts
│   ├── crypto/            # Cryptographic utilities
│   │   ├── hash.ts
│   │   ├── sign.ts
│   │   └── keypair.ts
│   └── utils/
│       ├── validation.ts
│       └── errors.ts
├── browser/               # Browser-specific build
├── react/                 # React components
└── dist/                  # Built outputs
```

### Error Handling

```typescript
import { OTrustError, ValidationError, NotFoundError } from '@otrust/sdk';

try {
  await otrust.timestamp.create({ hash: 'invalid' });
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Invalid input:', error.field, error.message);
  } else if (error instanceof NotFoundError) {
    console.error('Resource not found:', error.resourceId);
  } else if (error instanceof OTrustError) {
    console.error('OTRUST error:', error.code, error.message);
  }
}
```

### Type Safety

```typescript
// Full TypeScript support
import type {
  Claim,
  SignRequest,
  Verification,
  ProofAsAuthChallenge
} from '@otrust/sdk';

const claim: Claim = await otrust.timestamp.create({ hash });
```

---

## Roadmap

### Phase 1: Core SDK (Q1 2026)
- [x] API v1 versioning
- [ ] JavaScript/TypeScript SDK
- [ ] Python SDK
- [ ] Basic documentation

### Phase 2: Enhanced Features (Q2 2026)
- [ ] React/Vue components
- [ ] Django/Flask integration
- [ ] CLI tools
- [ ] Proof-as-Auth protocol

### Phase 3: Ecosystem (Q3 2026)
- [ ] Mobile SDKs (iOS/Android)
- [ ] Browser extensions
- [ ] Webhook integrations
- [ ] Enterprise features

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on contributing to the SDK.

## License

MIT License - See [LICENSE](../LICENSE) for details.

---

*OTRUST - Trust through cryptographic proof.*
