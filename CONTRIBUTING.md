# Contributing

Thanks for considering a contribution.

## Principles

- Keep public code free from production secrets, partner-specific data, and internal operational details.
- Prefer small, reviewable pull requests.
- Add or update tests when behavior changes.
- Keep examples clear and dependency-light.
- Use English for public documentation and comments.

## Local Setup

```bash
npm install
npm run build
npm run test:core
```

Package-specific checks:

```bash
npm run test --workspace @otrust/sdk
npm run test --workspace @otrust/react
cd sdk-python && python -m pip install -e ".[dev]" && pytest
```

## Pull Requests

Before opening a PR:

- Confirm no generated artifacts or local lockfiles are included unless intentionally needed.
- Confirm no `.env`, token, key, or private customer/partner content is included.
- Run the relevant package tests.
- Describe the change and the verification performed.

## Keeping `opensource` in sync with production

`opensource` is the public product surface. The private `core` repo adds production-only
operations on top. When you change public behavior, keep both repos aligned.

### Sync these paths from `core` → `opensource`

- `src/server.js`, `src/sign.js`, `src/zkproof.js`, `src/crypto.js`, `src/db.js`
- `web/`, `sdk-js/`, `sdk-python/`, `sdk-react/`, `cli/`, `circuits/`, `examples/`
- `docker-compose.yml`, `Dockerfile`, `.env.example`, `web/openapi.json`

### Keep private in `core` only

- `railway.toml`, `railway-start.js`, production bots and email workers
- Partner-specific hosted-login themes and customer credentials
- Internal monitoring, abuse tooling, and deployment secrets

### Before merging to `opensource` main

```bash
npm ci
npm run test:core
npm run test:integration
npm run build
npm run test --workspace @otrust/sdk -- --run
```

If the change came from `core`, confirm API routes, SDK behavior, and share URLs such as
`/proof/prf_*` and `/proof/id_*` still work for self-hosters.
