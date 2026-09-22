# syntax=docker/dockerfile:1

# Build context is the workspace root (v2/): the API depends on
# packages/contracts through the pnpm workspace.
#
# There is no compile step -- Bun runs the TypeScript directly -- so "building"
# means resolving dependencies. pnpm runs on Node, so it gets its own stage and
# the runtime image carries Bun alone.

# ---------- deps ----------
FROM node:24-slim AS deps

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /app
RUN corepack enable

# Manifests first: the dependency layer survives source-only changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/

# --prod drops drizzle-kit, typescript and the type packages.
RUN pnpm install --frozen-lockfile --prod

COPY apps/api/ apps/api/
COPY packages/contracts/ packages/contracts/

# ---------- runtime ----------
FROM oven/bun:1.4-slim AS runtime

# The git tag or short SHA; without it /health reports the package version.
ARG APP_VERSION=""
ENV NODE_ENV=production \
    PORT=3000 \
    APP_VERSION=${APP_VERSION}
WORKDIR /app

COPY --from=deps /app /app

EXPOSE 3000

# No curl in the image; Bun's fetch does the job.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1))"

# Migrations and the currency seed are idempotent, so they run on every start.
CMD ["sh", "-c", "bun apps/api/src/db/migrate.ts && exec bun apps/api/src/index.ts"]
