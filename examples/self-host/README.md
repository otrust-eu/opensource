# Self-host OTRUST

**You run the server. We wrote the code. You don't have to trust us.**

## 60 seconds

```bash
git clone https://github.com/otrust-eu/opensource.git
cd opensource
./scripts/quickstart.sh
```

Or manually:

```bash
export ADMIN_KEY=$(openssl rand -hex 32)
docker compose up -d --build
```

Open `http://localhost:3000/developers.html` — create org, API key, webhook.

## Production checklist

1. Set `ADMIN_KEY` to a strong random secret (32+ bytes)
2. Use managed MongoDB or a replicated cluster
3. Set `BASE_URL` to your public HTTPS URL
4. **Do not** set `HOSTED_MODE` — plan limits apply only on otrust.eu hosted service
5. Point CI at your instance (`secrets.OTRUST_API` + `secrets.OTRUST_API_KEY`)

## CI wedge

Copy `examples/github-action/timestamp-release.yml` into your repo.

Every release gets a Bitcoin-anchored proof. No vendor lock-in — switch hosts anytime, proofs verify forever.

## Why self-host?

- Compliance: hashes never leave your perimeter
- Zero-knowledge: we built a system where hosting yourself is the point
- Full platform: API keys, webhooks, SDK — all MIT, no tiers

[otrust.eu](https://www.otrust.eu) is the live web tool. Self-host when you need your own infra.