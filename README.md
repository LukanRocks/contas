# nf-price-tracker

A pnpm workspace. Each app is its own top-level folder.

| Package                     | Folder     | What it is                                                       |
| --------------------------- | ---------- | ---------------------------------------------------------------- |
| `@nf-price-tracker/backend` | `backend/` | NFC-e ingestion API — scrapes Brazilian fiscal notes into SQLite |
| `@nf-price-tracker/web`     | `web/`     | Plain HTML/CSS front end, served by the backend at `/`           |

Long-term goal: a grocery price database built from scanned NFC-e receipts.
Today the workspace holds the ingestion core only.

## Getting started

```bash
pnpm install
pnpm dev         # one server on :3000 — front end at /, API at /api
pnpm test        # every package (see below on fixtures)
pnpm typecheck   # every package
```

Then open <http://localhost:3000>. The backend serves the front end, so there
is a single origin and no CORS to configure.


No real fiscal note is committed to this repo — a scanned NFC-e carries the
buyer's CPF. Tests that need one skip unless you point `NFCE_FIXTURE` at a page
you captured yourself; copy [`.env.example`](.env.example) to `.env` to set that
up. See [backend/README.md](backend/README.md#testing).

Node 20+ (developed on 25). TypeScript runs directly via Node's native type
stripping, so there is no build step in any package.

Per-package commands work the usual two ways:

```bash
pnpm --filter @nf-price-tracker/backend test
```

```bash
cd backend && pnpm test
```

## Running with Docker

A multi-arch image (`linux/amd64`, `linux/arm64`) is published to GHCR by
[`.github/workflows/docker.yml`](.github/workflows/docker.yml) on every push to
`main`.

```bash
docker compose up -d
```

That pulls `ghcr.io/lukanrocks/nf-price-tracker:latest`, serves the app on
<http://localhost:3000>, and keeps the SQLite database in `./data` on the host
so it survives upgrades. To update:

```bash
docker compose pull && docker compose up -d
```

To run your working tree instead of the published image, replace the `image:`
line in [`compose.yaml`](compose.yaml) with `build: .`.

| Setting           | Notes                                                       |
| ----------------- | ----------------------------------------------------------- |
| `PORT`            | Host port to publish; defaults to `3000`                     |
| `NFCE_SAMPLE_URL` | Optional; reveals the "Exemplo" button. Put it in `.env`     |
| `./data`          | Bind mount holding the database — back this up               |

The container runs as a non-root user, and `/api/health` backs both the
Dockerfile `HEALTHCHECK` and the compose healthcheck, pinging SQLite so an
unwritable database fails the check rather than reporting a healthy process.

**First pull:** GHCR packages start private. After the first successful build,
either make the package public (Packages → nf-price-tracker → Package settings →
Change visibility) or log the server in with a personal access token that has
`read:packages`:

```bash
echo "$GITHUB_TOKEN" | docker login ghcr.io -u LukanRocks --password-stdin
```

## Adding an app

Create a top-level folder with a `package.json` named `@nf-price-tracker/<name>` —
the `"*"` glob in `pnpm-workspace.yaml` picks it up automatically. Extend the
shared compiler options so every package typechecks the same way:

```json
{ "extends": "../tsconfig.base.json" }
```

To depend on another workspace package, use the workspace protocol:

```json
{ "dependencies": { "@nf-price-tracker/backend": "workspace:*" } }
```

## Layout

```
package.json          workspace root: delegating scripts only
pnpm-workspace.yaml   package globs + native-build approvals
tsconfig.base.json    compiler options every package extends
Dockerfile            multi-stage image; no compile step, just dependencies
compose.yaml          local-server deployment
backend/              @nf-price-tracker/backend  (see backend/README.md)
web/                  @nf-price-tracker/web      (see web/README.md)
```
