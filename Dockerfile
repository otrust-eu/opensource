FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY . .

RUN npm install --omit=dev --ignore-scripts

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

RUN addgroup -g 1001 -S nodejs \
  && adduser -S otrust -u 1001 -G nodejs \
  && chown -R otrust:nodejs /app

USER otrust

CMD ["node", "src/server.js"]
