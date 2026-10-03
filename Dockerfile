# syntax=docker/dockerfile:1.7
#
# INRENT multi-target image. Build one service at a time:
#   docker build --target gateway -t inrent/gateway .
#   docker build --target worker  -t inrent/worker  .
#   docker build --target web     -t inrent/web     --build-arg NEXT_PUBLIC_APP_URL=https://inrent.ai --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.inrent.ai/v1 .
#   docker build --target migrate -t inrent/migrate .
#
# No secrets are baked into images: all configuration is supplied at runtime.
# Services handle SIGTERM themselves (graceful drain); run with an init process
# (`docker run --init`, compose `init: true`) to reap zombies.

ARG NODE_VERSION=22-bookworm-slim

# ── Base: Node + pnpm + OpenSSL (Prisma) ─────────────────────────────────────
FROM node:${NODE_VERSION} AS base
# Prisma's query engine needs libssl 3 (absent from -slim images).
RUN if ! ls /usr/lib/*-linux-gnu/libssl.so.3 >/dev/null 2>&1; then \
      apt-get update \
      && apt-get install -y --no-install-recommends libssl3 ca-certificates \
      && rm -rf /var/lib/apt/lists/*; \
    fi
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /repo

# ── Dependencies (cached on the lockfile) ────────────────────────────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm fetch --frozen-lockfile

FROM deps AS source
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --offline --frozen-lockfile

# ── Gateway ──────────────────────────────────────────────────────────────────
FROM source AS build-gateway
RUN pnpm --filter @inrent/gateway build \
 && pnpm --filter @inrent/gateway deploy --legacy --prod /out \
 && cp -r packages/db/prisma /out/prisma \
 && cd /out && /repo/packages/db/node_modules/.bin/prisma generate --schema prisma/schema.prisma

FROM base AS gateway
ENV NODE_ENV=production INRENT_ENV=production GATEWAY_PORT=8080
WORKDIR /app
COPY --from=build-gateway --chown=node:node /out /app
USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.GATEWAY_PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/index.js"]

# ── Worker ───────────────────────────────────────────────────────────────────
FROM source AS build-worker
RUN pnpm --filter @inrent/worker build \
 && pnpm --filter @inrent/worker deploy --legacy --prod /out \
 && cp -r packages/db/prisma /out/prisma \
 && cd /out && /repo/packages/db/node_modules/.bin/prisma generate --schema prisma/schema.prisma

FROM base AS worker
ENV NODE_ENV=production INRENT_ENV=production
WORKDIR /app
COPY --from=build-worker --chown=node:node /out /app
USER node
CMD ["node", "--enable-source-maps", "dist/index.js"]

# ── Web (Next.js standalone) ─────────────────────────────────────────────────
FROM source AS build-web
# Public values are inlined into the client bundle at build time.
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8080/v1
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NODE_ENV=production
RUN pnpm --filter @inrent/web build

FROM base AS web
ENV NODE_ENV=production INRENT_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build-web --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build-web --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build-web --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]

# ── Migrations / seed (one-off job) ──────────────────────────────────────────
FROM source AS migrate
ENV NODE_ENV=production
USER node
CMD ["pnpm", "--filter", "@inrent/db", "migrate:deploy"]
