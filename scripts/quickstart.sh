#!/usr/bin/env bash
# OTRUST — self-host in ~60 seconds. No accounts. You own the server.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-3000}"
ADMIN_KEY="${ADMIN_KEY:-$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p -c 64)}"
AUTH_SECRET="${AUTH_SECRET:-$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p -c 64)}"
export ADMIN_KEY AUTH_SECRET PORT

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker required. Install: https://docs.docker.com/get-docker/"
  exit 1
fi

echo "→ Starting OTRUST (MongoDB + app) on http://localhost:${PORT}"
ADMIN_KEY="$ADMIN_KEY" AUTH_SECRET="$AUTH_SECRET" PORT="$PORT" docker compose up -d --build

echo "→ Waiting for health check..."
for i in $(seq 1 30); do
  if curl -sf "http://localhost:${PORT}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if ! curl -sf "http://localhost:${PORT}/health" >/dev/null 2>&1; then
  echo "Server did not become healthy. Check: docker compose logs app"
  exit 1
fi

echo ""
echo "✓ OTRUST is running"
echo ""
echo "  Web UI:     http://localhost:${PORT}"
echo "  Health:     http://localhost:${PORT}/health"
echo "  Developers: http://localhost:${PORT}/developers.html"
echo "  Admin key:  ${ADMIN_KEY}"
echo ""
echo "Next — create an org:"
echo "  curl -X POST http://localhost:${PORT}/api/v1/platform/organizations \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -H 'X-Admin-Key: ${ADMIN_KEY}' \\"
echo "    -d '{\"name\":\"My Company\"}'"
echo ""
echo "CI wedge — add examples/github-action/timestamp-release.yml to your repo."
echo "Save ADMIN_KEY in your secrets manager. Never commit it."
