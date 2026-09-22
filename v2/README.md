# Contas — v2

The next architecture of [Contas](../README.md): a self-hosted finance API,
built API-first. The frontend comes later and consumes the OpenAPI contract.
Today's `container/` and `mobile/` projects will move onto this stack over
time. Until then nothing here touches them, and they share nothing with it.

Everything is a transaction: value moves from one account to another, each in
its own currency. Accounts are `managed` (money you hold and track), `unmanaged`
(counterparties and categories), or `system` (created by the server, like
Opening Balance BRL). All data lives in spaces, which users join as owner,
editor or viewer.

| Package             | Folder                | What it is                                                           |
| ------------------- | --------------------- | -------------------------------------------------------------------- |
| `@contas/api`       | `apps/api/`           | The API: Bun, Hono with zod-openapi, Postgres 17 through Drizzle      |
| `@contas/contracts` | `packages/contracts/` | Zod schemas and types for every request and response, for any client |

The design lives in [`packages/specs/finance-api.md`](packages/specs/finance-api.md), the spec this was built
from. Section references in the code, like §7.1 or §13.5, point into it. It is a plain folder for now, not a
package, kept apart so documentation can later be built from it.

## Getting started

You need Bun, pnpm and Docker. From this folder:

```bash
cp .env.example .env
```

```bash
docker compose up -d db
```

```bash
pnpm install
```

```bash
pnpm db:migrate
```

```bash
pnpm dev
```

Then open <http://localhost:3000/docs>, the Scalar reference generated from
`/v1/openapi.json`. Every `/v1` request needs an `X-User-Id` header: create a
user with `POST /v1/users` (the one request that needs none), then set its id
under Authentication in `/docs`. Or load the demo data below and use one of its
users.

The `db` service publishes Postgres on `127.0.0.1:5432` only, so `pnpm dev`
and `pnpm test` can reach it from the host.

## Scripts

Run from this folder. Dependencies install with pnpm, and everything runs on Bun.

| Script                   | Does                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `pnpm dev`               | The API on `PORT` (3000), restarting on change                                          |
| `pnpm test`              | The whole suite, against the test database                                             |
| `pnpm typecheck`         | `tsc --noEmit` in every package                                                        |
| `pnpm db:generate`       | A new migration from changes to `apps/api/src/db/schema.ts`                            |
| `pnpm db:migrate`        | Applies pending migrations and refreshes the currency list. Safe to run any time       |
| `pnpm seed:demo`         | Loads the demo data. Refuses if demo data already exists                               |
| `pnpm seed:demo --reset` | Deletes the demo data, then loads it again                                             |

## Settings

| Variable            | Notes                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`      | The main database. Compose builds its own for the `api` container                                |
| `DATABASE_URL_TEST` | The disposable test database. Tests refuse to run if it equals `DATABASE_URL`                    |
| `PORT`              | HTTP port: the server's in `pnpm dev`, the published one in Compose. Defaults to 3000            |
| `APP_VERSION`       | Reported by `/health`. Pass a git tag or short SHA at build time, otherwise the package version  |
| `SOURCE_URL`        | Where users can get this server's source, linked from `/docs`. Defaults to this repository       |

`.env` lives here, in `v2/`, and is gitignored. See [`.env.example`](.env.example).

## Testing

```bash
pnpm test
```

The suite runs on `bun test` against `DATABASE_URL_TEST`. The `db` service
creates `contas_test` the first time its volume starts. The preload in
[`test/setup.ts`](apps/api/test/setup.ts) migrates it once per run.

Tests call the app in-process with `app.request()`, with no server. Each test
runs inside a database transaction that rolls back at the end, so tests never
see each other's rows. The few that must see committed state, like audit rows
written atomically with their data or cascading deletes, empty the tables
afterwards instead.

[`test/demo-seed.test.ts`](apps/api/test/demo-seed.test.ts) is the acceptance
test. It loads the demo data and checks every expected number in §13.5 of
[the spec](packages/specs/finance-api.md#135-expected-results) through the API: every balance, the totals, the card's balance history
by São Paulo and by UTC months, the audit trail and who can see what.

## Demo data

```bash
pnpm seed:demo
```

Two spaces, "Casa (demo)" and "Estúdio Ana (demo)", with three users: Ana
(owner of both), Bruno (editor in Casa, viewer in Estúdio) and Carla (in
neither). Three months of salary, rent, card bills, groceries, a purchase in
dollars and a currency conversion, all on fixed dates. Everything goes through
the same services as the API, so business rules, system accounts and audit rows
all happen as they would for real. The data lives in
[`src/db/demo/ledger.ts`](apps/api/src/db/demo/ledger.ts).

## Running with Docker

```bash
APP_VERSION=$(git rev-parse --short HEAD) docker compose up -d --build
```

That builds the API image on `oven/bun`, starts Postgres 17 with a named
volume, applies migrations on every start, and serves the API on
`${PORT:-3000}`. Both containers have healthchecks: the API's calls `/health`,
which answers `503` whenever Postgres does not answer `SELECT 1`.

If the old `container/` server runs on the same host, it also wants port 3000:
set `PORT` in `.env`.

## Conventions

- **Identity.** `X-User-Id` names the acting user. It is identification, not
  authentication, and suits a trusted home network only. Real auth later will
  replace one middleware, [`acting-user.ts`](apps/api/src/middleware/acting-user.ts).
- **Money** is an integer string of the currency's minor units, in both
  directions: `"12345"` is 123.45 BRL. It is a `bigint` in the database and a
  `BigInt` in between, and never a JS number.
- **Time** is UTC only. Clients send ISO 8601 ending in `Z`, with up to
  millisecond precision. The API returns `Date.toISOString()`, e.g.
  `2026-09-20T17:30:00.000Z`. Converting to and from local time, including the
  period edges of balance history, is the client's job.
- **Errors** are `application/problem+json` with a `code`, and an `errors` list
  of `{ path, message }` for validation failures.
- **Request bodies are strict.** Unknown fields are a `422`, each one named.
- **Lists** that grow are cursor-paginated: pass `next_cursor` back as `cursor`
  until it is null.

A few choices go beyond the letter of [the spec](packages/specs/finance-api.md):

- Account names `Opening Balance <code>` are reserved for system accounts.
- Names are trimmed.
- Moving a transaction side to an account of another currency requires that
  side's value in the same update.

The code states each one where it applies.

## License

Like the rest of the repo, `AGPL-3.0-only`: see the [root README](../README.md#license) and
[LICENSE](../LICENSE). The OpenAPI document declares it, and `/docs` links to the source.

If you run a modified version for other people, the license requires you to offer them its
source. Set `SOURCE_URL` to your fork's repository, and the link in `/docs` points there.

## Layout

```
package.json               workspace root: scripts only
pnpm-workspace.yaml        apps/* and packages/*
tsconfig.base.json         compiler options every package extends
docker-compose.yml         db (Postgres 17) and api
docker/postgres/           init script that creates the test database
apps/api/
  Dockerfile               pnpm installs on Node, the image runs on oven/bun
  drizzle.config.ts        for db:generate
  src/
    index.ts               Bun.serve entry
    app.ts                 the Hono app: middleware, routes, OpenAPI, /docs
    env.ts                 environment, parsed with Zod
    db/                    client, schema, migrations, migrate, currency seed, demo/
    lib/                   errors, audit, money, cursors, ids, the router
    middleware/            acting user, space access and roles
    modules/<name>/        routes.ts (HTTP and OpenAPI) and service.ts (the rules)
  test/                    one file per module, plus helpers and the demo acceptance test
packages/contracts/src/    the shared Zod schemas
packages/specs/            the spec, finance-api.md
```
