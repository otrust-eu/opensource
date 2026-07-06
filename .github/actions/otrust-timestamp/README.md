# OTRUST Timestamp — GitHub Action

Timestamp release artifacts on **your** OTRUST instance. Bitcoin-anchored proof in every CI run.

## Quick start

```yaml
- uses: otrust-eu/core/.github/actions/otrust-timestamp@v2
  with:
    files: dist/** CHANGELOG.md
    api: ${{ secrets.OTRUST_API }}
    api-key: ${{ secrets.OTRUST_API_KEY }}
```

**Self-host first.** Point `OTRUST_API` at your instance (`https://otrust.yourcompany.com`).  
`https://www.otrust.eu` is a public demo only — no production SLA.

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `files` | yes | — | Space-separated paths or globs |
| `api` | no | `https://www.otrust.eu` | OTRUST base URL |
| `api-key` | no | — | Org API key (`otrust_live_...`) |
| `idempotency-key` | no | — | Safe retries on re-run |
| `wait-for-confirmation` | no | `0` | Poll for Bitcoin confirmation (minutes) |

## Outputs

| Output | Description |
|--------|-------------|
| `receipt_ids` | JSON array of `{ file, receipt, proof_url }` |
| `evidence_urls` | JSON array of `{ file, evidence_url }` |

## Secrets setup

1. Self-host: `./scripts/quickstart.sh` or `docker compose up -d`
2. Open `/developers.html` → create org → API key
3. Add repo secrets:
   - `OTRUST_API` — your instance URL
   - `OTRUST_API_KEY` — issued key

## Full workflow

Copy [examples/github-action/timestamp-release.yml](../../../examples/github-action/timestamp-release.yml).

## Verify

Proofs are independently verifiable — even if OTRUST disappears.  
Open `proof_url` from outputs or download `evidence.zip`.

## License

MIT — same as [OTRUST core](https://github.com/otrust-eu/core).