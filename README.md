# OTRUST

**Prove it existed. On Bitcoin. Without trusting us.**

Zero-knowledge timestamping and document signing. We only see hashes — never your files. Proofs anchor to Bitcoin via OpenTimestamps and verify forever, offline.

**Use it on the web at [otrust.eu](https://www.otrust.eu)** — timestamp, sign, no accounts. **Or run your own** in 60 seconds — full platform, you own the server.

[![CI](https://github.com/otrust-eu/core/actions/workflows/ci.yml/badge.svg)](https://github.com/otrust-eu/core/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-brightgreen.svg)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-6.0+-green.svg)](https://www.mongodb.com/)

## Run your own — 60 seconds

```bash
git clone https://github.com/otrust-eu/opensource.git
cd opensource
./scripts/quickstart.sh
```

Open `http://localhost:3000` — full platform (API keys, webhooks, SDK). You own the server. No tiers. No Stripe. No trusting our infra.

See [examples/self-host/README.md](examples/self-host/README.md) for production checklist.

## CI wedge — timestamp every release

Copy [examples/github-action/timestamp-release.yml](examples/github-action/timestamp-release.yml) into your repo. Point it at **your** instance:

```yaml
secrets.OTRUST_API      # https://otrust.yourcompany.com
secrets.OTRUST_API_KEY  # from /developers.html
```

Every release gets Bitcoin-anchored evidence in CI. That's the lock-in — the protocol, not our hosting.

## 🚀 Services

### ⏱️ Timestamp
Prove that a file existed at a specific point in time. Drop any file – it gets hashed locally, submitted to OpenTimestamps calendar servers, and anchored to the Bitcoin blockchain within 24-48 hours. Download a `.ots` proof file that can be verified independently forever.

**Use cases:** Research data, intellectual property, contracts, creative works, legal documents.

### ✍️ OTRUST Signed
Multi-party document signing with blockchain proof. Create a signing session, invite signers via email, each party verifies the document hash and signs cryptographically. The final signature package is anchored to Bitcoin.

**Sign via email:** Send to signers with `sign@otrust.eu` in CC – one-click signing, no accounts needed.

**Use cases:** Contracts, agreements, NDAs, board resolutions, consent forms.

## ✨ Features

- 🔐 **Zero Knowledge** – Files are hashed locally; only the hash is sent
- ⛓️ **Blockchain Anchored** – Timestamps verified against Bitcoin blockchain
- ✍️ **Multi-Party Signing** – Signed service for document signing with blockchain proof
- 🆔 **No Accounts** – No registration, no tracking, no data collection
- 🔑 **Ed25519 Signatures** – Cryptographic proof of authorship
- 🌐 **Open Source** – MIT licensed, self-host friendly
- 🛡️ **Security Hardened** – CSRF protection, rate limiting, CSP headers

## Quick Start

Go to [www.otrust.eu](https://www.otrust.eu) — drop a file, get a Bitcoin proof. No account, no install. Need your own server? **Self-host** (above).

### Browser Extension

Install from Chrome Web Store: [OTRUST Blockchain Timestamper](https://chromewebstore.google.com/detail/otrust-blockchain-timesta/gadpcgaelaihbnnijgkcfmabdmkgpdol)

### CLI

```bash
# Install globally
npm install -g otrust-core

# Generate a keypair
otrust keygen > ~/.otrust/key.json

# Timestamp a file
otrust claim document.pdf

# Check status
otrust status ot_abc123xyz

# Verify a proof
otrust verify document.pdf document.pdf.ots
```

### API

```bash
# Get a challenge
curl https://www.otrust.eu/challenge

# Submit a claim
curl -X POST https://www.otrust.eu/claim \
  -H "Content-Type: application/json" \
  -d '{"hash":"...","signature":"...","pubkey":"..."}'
```

See [API Documentation](https://www.otrust.eu/api-docs.html) for full reference.

## Self-Hosting (detailed)

### Docker — recommended

```bash
export ADMIN_KEY=$(openssl rand -hex 32)
docker compose up -d --build
# → http://localhost:3000
```

Or `./scripts/quickstart.sh` (generates `ADMIN_KEY`, waits for health).

### Node.js — development

```bash
npm install
cp .env.example .env   # set MONGODB_URL, ADMIN_KEY
npm run dev
```

### Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGODB_URL` | MongoDB connection string | `mongodb://localhost:27017` |
| `MONGODB_DB` | Database name | `otrust` |
| `PORT` | Server port | `3000` |
| `ADMIN_KEY` | Platform admin (`X-Admin-Key`) | — **required in prod** |
| `BASE_URL` | Public URL for links/webhooks | `http://localhost:3000` |
| `HOSTED_MODE` | Plan limits on otrust.eu hosted service | unset = unlimited |

**Do not set `HOSTED_MODE` on self-host.** Plan limits apply only to the hosted service at otrust.eu, not your deployment.

## How It Works

1. **Hash** – Your file is hashed locally (SHA-256)
2. **Sign** – The hash is signed with your Ed25519 private key
3. **Submit** – Only the hash + signature are sent to the server
4. **Anchor** – OpenTimestamps aggregates hashes and anchors to Bitcoin
5. **Prove** – Download the `.ots` proof file when confirmed

The server never sees your original file. Verification can be done offline against any Bitcoin node.

## Architecture

```
┌──────────────┐     hash+sig     ┌──────────────┐     merkle     ┌──────────────┐
│    Client    │ ───────────────▶ │    OTRUST    │ ─────────────▶ │   Bitcoin    │
│  (browser)   │                  │   (server)   │                │ (blockchain) │
└──────────────┘                  └──────────────┘                └──────────────┘
     │                                   │                              │
     │ file never leaves                 │ only stores hashes          │ immutable
     │ your device                       │ + signatures                │ timestamp
```

## Project Structure

```
otrust-core/
├── src/                      # Core application
│   ├── server.js             # Express app, routes, middleware
│   ├── crypto.js             # Ed25519/secp256k1 signatures
│   ├── db.js                 # MongoDB connection & queries
│   └── pow.js                # Proof-of-work challenges
├── cli/
│   └── otrust.js             # CLI tool (npm install -g)
├── web/                      # Static frontend
│   ├── index.html            # Timestamp – main interface
│   ├── sign.html             # Signed – create signing session
│   ├── sign-act.html         # Signed – signer action page
│   ├── sign-view.html        # Signed – view session status
│   ├── docs.html             # Documentation hub
│   ├── api-docs.html         # API reference (Swagger UI)
│   ├── about.html            # About page
│   ├── install.html          # Desktop app installer
│   ├── setup.html            # Setup wizard
│   ├── privacy-policy.html   # Privacy policy
│   ├── terms.html            # Terms of service
│   ├── openapi.json          # OpenAPI 3.0 specification
│   └── extension/            # Browser extension (built)
├── test/                     # Test suites
│   ├── *.test.js             # Jest unit/integration tests
│   ├── e2e/                  # Playwright E2E tests
│   └── setup.js              # Test configuration
├── scripts/                  # Build & maintenance scripts
│   ├── build-extension.js    # Build browser extension zip
│   └── sync-docs.js          # Validate OpenAPI spec
├── addons/                   # Optional integrations
│   ├── browser-extension/    # Chrome/Firefox extension source
│   ├── gpt/                  # ChatGPT custom GPT integration
│   ├── telegram-bot/         # Telegram bot (@OTRUSTbot)
│   ├── whatsapp-bot/         # WhatsApp Business API bot
│   └── email-worker/         # Cloudflare Email Worker (email-to-timestamp)
├── docs/                     # Documentation
│   ├── CHANGELOG.md          # Version history
│   └── SECURITY_AUDIT.md     # Security audit report
├── .github/                  # GitHub configuration
│   ├── workflows/            # CI/CD pipelines
│   ├── CONTRIBUTING.md       # Contribution guidelines
│   ├── SECURITY.md           # Security policy
│   └── ISSUE_TEMPLATE/       # Issue templates
├── Dockerfile                # Container build
├── docker-compose.yml        # Full stack deployment
└── package.json
```

## 🔌 Integrations

OTRUST can be accessed through multiple channels:

| Integration | Description | Status |
|-------------|-------------|--------|
| **Web** | Main interface at otrust.eu | ✅ Live |
| **Email Signing** | CC `sign@otrust.eu` to sign documents | ✅ Live |
| **Browser Extension** | Chrome/Firefox timestamp any page | ✅ [Chrome Web Store](https://chromewebstore.google.com/detail/otrust-blockchain-timesta/gadpcgaelaihbnnijgkcfmabdmkgpdol) · [extension.zip](https://www.otrust.eu/extension.zip) |
| **CLI** | `claim`, `verify`, `bulk`, `history`, `ipfs-export` | ✅ `cli/otrust.js` |
| **API** | REST API + webhooks + embed badges | ✅ [API docs](https://www.otrust.eu/api-docs.html) · [OpenAPI](https://www.otrust.eu/openapi.json) |
| **Embed badge** | Live trust stats on your site | ✅ [/embed](https://www.otrust.eu/embed) |
| **Bookmarklet** | Verify current page without extension | ✅ [/bookmarklet](https://www.otrust.eu/bookmarklet) |
| **ChatGPT** | Custom GPT for AI-assisted timestamping | ✅ Available |
| **Telegram Bot** | Hash/file timestamp via Telegram | 🧪 `addons/telegram-bot/` — see [docs/DEPLOY.md](docs/DEPLOY.md) |
| **WhatsApp Bot** | Meta Cloud API webhook bot | 🧪 `addons/whatsapp-bot/` |
| **Status** | Public ops dashboard | ✅ [/status](https://www.otrust.eu/status) |

## 📄 License

MIT © OTRUST

## 🛠️ Available Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start production server |
| `npm run dev` | Start with hot-reload (watch mode) |
| `npm test` | Run all Jest tests |
| `npm run test:unit` | Run unit tests only |
| `npm run test:integration` | Run API integration tests |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run test:e2e` | Run Playwright E2E tests |
| `npm run test:all` | Run all tests (Jest + Playwright) |
| `npm run build` | Build extension + SDKs |
| `npm run build:extension` | Build browser extension zip |
| `./scripts/quickstart.sh` | Docker self-host bootstrap |

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](.github/CONTRIBUTING.md) first.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 🔒 Security

Found a security issue? Please report it privately via [GitHub Security Advisories](https://github.com/otrust-eu/core/security/advisories/new) or email security@otrust.eu.

See our [Security Policy](.github/SECURITY.md) for details.

## 💬 Support

- 📖 [Documentation](https://www.otrust.eu/docs.html)
- 📚 [API Reference](https://www.otrust.eu/api-docs.html)
- 🐛 [GitHub Issues](https://github.com/otrust-eu/core/issues)
- 💬 [Discussions](https://github.com/otrust-eu/core/discussions)

---

<p align="center">
  <strong>Bitcoin donations:</strong> <code>bc1q3pvu7q26hk5daks9jy3r4jakw5yx3hd7kvjxj2</code>
</p>
