# Build generated browser assets from locked dependencies.
FROM node:24-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build:extension && npm run build:poseidon
RUN npm prune --omit=dev && npm rebuild --omit=dev

FROM node:24-alpine AS runtime

WORKDIR /app
COPY --from=build --chown=1001:1001 /app /app

ENV NODE_ENV=production
ENV PORT=3000
ENV OTRUST_DB_PATH=/app/data/otrust.sqlite
ENV PATH="/opt/ots/bin:$PATH"

RUN apk add --no-cache ca-certificates python3 py3-pip && \
    python3 -m venv /opt/ots && \
    /opt/ots/bin/pip install --no-cache-dir --no-compile -r /app/requirements-ots.txt && \
    /opt/ots/bin/ots --version && \
    /opt/ots/bin/python3 /app/scripts/ots-stamp-digest.py --check

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

RUN addgroup -g 1001 -S nodejs && \
    adduser -S otrust -u 1001 -G nodejs && \
    mkdir -p /app/data && \
    chown -R otrust:nodejs /app/data

USER otrust

CMD ["node", "src/server.js"]
