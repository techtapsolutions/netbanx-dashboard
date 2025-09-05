# Multi-stage build for production
FROM node:18-alpine AS base
WORKDIR /app

# Install system dependencies needed for CI and native modules
RUN apk add --no-cache \
    libc6-compat \
    python3 \
    make \
    g++ \
    curl \
    bash \
    openssl

# Install dependencies only when needed
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
# Install all dependencies including dev dependencies for build
RUN npm ci

# Install only production dependencies for runtime
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --only=production --ignore-scripts && npm cache clean --force

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy source code and configuration
COPY . .

# Set environment variables for build
ENV NODE_ENV=production
ENV SKIP_ENV_VALIDATION=true
ENV PRISMA_GENERATE_SKIP_AUTOINSTALL=true
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder

# Use custom build script instead of direct build
RUN node scripts/build.js

# Final production stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application from builder stage
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma files
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

# Copy only production dependencies
COPY --from=prod-deps /app/node_modules ./node_modules

# Create logs directory with proper permissions
RUN mkdir -p logs && chown -R nextjs:nodejs logs

USER nextjs

EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/api/health || exit 1

CMD ["node", "server.js"]