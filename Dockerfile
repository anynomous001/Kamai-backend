# ============================================================
# Kamai Backend — Dockerfile
# Multi-stage build for production-grade image
# ============================================================

# ── Stage 1: Dependencies ─────────────────────────────────────
FROM node:22-alpine AS deps

# Without the `openssl` CLI present, Prisma's postinstall can't detect
# the actual OpenSSL version on this image (Alpine 3.24 ships OpenSSL
# 3.x/libssl.so.3 only) and silently guesses "openssl-1.1.x" instead —
# a schema-engine binary that then fails to even load (missing
# libssl.so.1.1) the moment anything runs `prisma migrate`/`db push`.
RUN apk add --no-cache openssl

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY prisma ./prisma/

RUN pnpm install --frozen-lockfile --prod=false

# ── Stage 2: Builder ─────────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm run build

# ── Stage 3: Production ───────────────────────────────────────
FROM node:22-alpine AS production

# See the `deps` stage comment: needed for correct Prisma engine
# auto-detection during this stage's own `pnpm install`.
RUN apk add --no-cache openssl

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 fastify

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY prisma ./prisma/

# `prisma` (the CLI, needed to run `db:generate`/`prisma generate`
# directly) is a devDependency and is intentionally excluded by --prod.
# That's fine — @prisma/client's own postinstall script already generates
# the client during this install step, using the correct locally-pinned
# engine version. A separate `pnpm run db:generate` here would try to
# invoke a `prisma` binary that was never installed in this stage.
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist

USER fastify

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/main.js"]
