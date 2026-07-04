# Dockerfile for otrust
# Zero-knowledge blind notary service

FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Run as non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S otrust -u 1001 -G nodejs

USER otrust

# Start server
CMD ["node", "src/server.js"]
