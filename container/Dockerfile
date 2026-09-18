# syntax=docker/dockerfile:1

# There is no compile step: Node strips the TypeScript types at load time, so
# "building" here means resolving dependencies. The split stage exists only to
# keep the C toolchain (needed if better-sqlite3 has no prebuild for the target
# platform) out of the published image.

# ---------- builder ----------
FROM node:24-slim AS builder

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /app

# better-sqlite3 compiles from source when no prebuilt binding matches the
# platform -- notably on arm64 builds.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

# Manifests first: dependency layers survive source-only changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/
COPY web/package.json web/

# --prod drops typescript and the @types packages; nothing here compiles.
RUN pnpm install --frozen-lockfile --prod

COPY backend/ backend/
COPY web/ web/

# ---------- runtime ----------
FROM node:24-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app

# The workspace layout is preserved on purpose: the server resolves both the
# database and the web root relative to its own file, not the cwd.
COPY --from=builder /app /app

# Mount point for the SQLite database.
RUN mkdir -p /app/data

# Runs as root, matching the other services on the homelab host: a bind-mounted
# directory keeps the host's ownership (typically root), and a non-root
# container could not write to it without a chown on the host first.
EXPOSE 3000

# No curl in the image; Node's own fetch does the job.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "backend/src/server.ts"]
