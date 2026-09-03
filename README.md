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
backend/              @nf-price-tracker/backend  (see backend/README.md)
web/                  @nf-price-tracker/web      (see web/README.md)
```
