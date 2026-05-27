# OTRUST Open Source

Self-hostable trust infrastructure for timestamping, document signing, identity proofs, hosted proof login, SDKs, CLI tooling, and cryptographic verification.

This repository is the clean public source tree. It does not contain OTRUST production infrastructure, service credentials, operational bots, private deployment config, customer-specific hosted-login themes, or historical private git data.

## What Is Included

- `src` - Express server, API routes, database helpers, OpenTimestamps integration, signing, proof, and hosted-auth logic.
- `web` - Static web UI, hosted login page, proof/signing pages, OpenAPI docs, and browser assets.
- `sdk-js` - TypeScript SDK for timestamping, signing, proof, auth, and browser-side verification helpers.
- `sdk-python` - Python SDK for server-side and automation use cases.
- `sdk-react` - React components and hooks for OTRUST login, proof badges, signatures, and timestamp widgets.
- `cli` - Command-line tool for key generation, hashing, timestamping, and verification.
- `circuits` - Circom source circuits for age, income, and membership proof experiments.
- `addons/browser-extension` - Source for the browser extension.
- `examples` - Minimal usage examples.

## Quick Start

Install dependencies:

```bash
npm install
```

Run the test set that does not need external services:

```bash
npm run test:core
```

Build the TypeScript packages:

```bash
npm run build
```

Start the server in development mode:

```bash
cp .env.example .env
npm run dev
```

Open `http://localhost:3000`.

## Self-Hosting With Docker

The easiest full local stack is Docker Compose:

```bash
cp .env.example .env
docker compose up --build
```

The app will listen on `http://localhost:3000` and MongoDB will run on the internal `mongodb` service. The default `.env.example` disables real Bitcoin anchoring so a local instance can boot without the OpenTimestamps CLI. Set `ENABLE_BLOCKCHAIN=true` and install `opentimestamps-client` if you want real anchoring.

## Environment

Start from `.env.example`. Important values:

- `PORT` - HTTP port for the server.
- `BASE_URL` - Public base URL used when creating hosted login links.
- `MONGODB_URI` and `MONGODB_DB` - MongoDB connection settings.
- `AUTH_SECRET` - Stable secret for auth callback tokens. Generate a strong random value for production.
- `ADMIN_KEY` - Required for admin-only endpoints such as hosted-login branding.
- `ENABLE_BLOCKCHAIN` - Set to `true` when the OpenTimestamps CLI is installed and reachable.
- `EMAIL_MODE` - `mock`, `smtp`, or `resend`.

## Hosted Login Branding

Self-hosted instances can store approved hosted-login themes per `client_id` and `theme_id` through the admin branding endpoint. Theme values are sanitized, partner JavaScript is not accepted, and the OTRUST disclosure remains visible.

```http
PUT /admin/auth-branding/acme_prod?theme_id=acme_dark
X-Admin-Key: <admin-key>
Content-Type: application/json
```

```json
{
  "logoUrl": "https://example.com/assets/logo.svg",
  "backgroundColor": "#F8FAFC",
  "primaryColor": "#12324A",
  "textColor": "#0F1B2D",
  "fontFamily": "Inter",
  "borderRadius": 8,
  "spacingScale": "default",
  "headline": "Sign in to Acme",
  "subhead": "Secure verification with OTRUST Proof",
  "footerText": "Acme uses OTRUST as identity provider"
}
```

## CLI

```bash
node cli/otrust.js keygen
node cli/otrust.js claim ./document.pdf
node cli/otrust.js verify ./document.pdf
```

The CLI defaults to the hosted API. Set `OTRUST_API=http://localhost:3000` when testing against your self-hosted instance.

## Security Model

Client-side hashing means raw files do not need to be uploaded for timestamping. The API receives hashes, signatures, proof metadata, and challenge data required for the selected flow. OpenTimestamps proofs can be created locally or disabled for isolated development.

Never commit `.env`, private keys, production databases, or partner secrets. For security reports, see `SECURITY.md`.

## License

MIT. Maintained by Kris Ledel.
