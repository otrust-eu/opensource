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
