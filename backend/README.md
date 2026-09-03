# nf-price-tracker — NFC-e ingestion core

Ingests a Brazilian **NFC-e** QR-code URL, scrapes the state fiscal portal page it
points to, and stores both the raw HTML and a structured extraction in SQLite.

MVP scope: ingestion + storage only. No auth, no frontend, no product matching,
no analytics.

The `@nf-price-tracker/backend` package of the [nf-price-tracker](../README.md)
workspace.

## Setup

Install once from the workspace root, then run scripts from either place:

```bash
pnpm install
```

```bash
cd backend && pnpm dev
```

```bash
pnpm --filter @nf-price-tracker/backend dev
```

`pnpm dev` at the root is a shortcut for the backend. Node 20+ (developed on
25); TypeScript runs directly via Node's native type stripping, so there is no
build step.

| Env var         | Default                    | Purpose                         |
| --------------- | -------------------------- | ------------------------------- |
| `PORT`          | `3000`                     | HTTP port                       |
| `DATABASE_PATH` | `<repo root>/data/nf-price-tracker.db` | SQLite file         |
| `WEB_ROOT`      | `../web/public`            | Front-end files to serve at `/` |

The database lives at the workspace root — `data/nf-price-tracker.db`, beside
the apps rather than inside one of them. The default is resolved from the
package itself, so it lands there however you launch the server. `data/` is
gitignored.

This server hosts both halves of the app on one origin:

- `/` — the [`@nf-price-tracker/web`](../web/README.md) front end (static files,
  no build step)
- `/api/*` — the JSON API below

Because the page and the API share an origin, there is no CORS to configure.

## API

### `POST /api/nfce`

```bash
curl -X POST http://localhost:3000/api/nfce \
  -H 'content-type: application/json' \
  -d '{"url":"https://www.fazenda.pr.gov.br/nfce/qrcode?p=<44-digit-chave>%7C3%7C1"}'
```

Extracts the chave from the URL's `p` parameter, routes by UF, fetches the
scanned URL **verbatim**, parses, cross-checks against the chave, upserts in a
transaction, logs the parsed object, and returns it.

| Status | Meaning                                                                    |
| ------ | -------------------------------------------------------------------------- |
| `200`  | Ingested; body is the parsed note with its items                           |
| `400`  | Malformed body, or a URL with no valid 44-digit chave                      |
| `422`  | UF has no parser (only `41`/Paraná ships today) — no fetch, nothing stored |
| `502`  | Portal unreachable or page unparseable — nothing stored                    |

### `GET /api/nfce`

Lists stored notes, newest emission first (falling back to when we first saw
them). Summaries only — no items, no markup — plus an `item_count` per note.

```bash
curl 'http://localhost:3000/api/nfce?limit=50&offset=0'
```

```json
{ "total": 1, "limit": 50, "offset": 0, "notes": [{ "chave": "...", "item_count": 40 }] }
```

`limit` defaults to 200 (max 500) and `offset` to 0; out-of-range paging is a
`400`.

### `GET /api/nfce/:chave`

Returns the stored note with its items, or `404`. `raw_html` is stored in full
but omitted from this response so it stays readable; `raw_html_bytes` reports its
size instead. To read the markup itself:

```bash
sqlite3 data/nf-price-tracker.db "SELECT raw_html FROM notes WHERE chave = '...'"
```

### `GET /api/nfce/:chave/html`

The exact page we captured, served as `text/html` for display only. The web app
embeds it in a sandboxed iframe as the last section of a note.

Because this markup comes from a third-party portal and the API now shares an
origin with the front end, the response carries `Content-Security-Policy:
sandbox` (opaque origin, scripts and forms disabled) and
`X-Content-Type-Options: nosniff`. The header applies however it is loaded, so
it stays inert even if opened directly in a tab.

`404` if the note is unknown.

## Testing

```bash
pnpm test
```

Tests never hit the network, and **no real note is committed** — a scanned
NFC-e is someone's shopping list and carries their CPF. So the suite comes in
two halves:

- **Always run** — number/date parsing, chave decoding and the mod-11 check,
  routing, validation, error paths, and the static file serving. These use
  synthetic values (`12.345.678/0001-99`, `111.444.777-35`, a made-up but
  structurally valid chave).
- **Need a real note** — the parser and ingest tests. They skip with a reason
  unless `NFCE_FIXTURE` points at a page you captured yourself.

Capture one and the rest light up:

```bash
pnpm --filter @nf-price-tracker/backend fixture:capture "<qr-url>"
```

That saves to `data/nfce-fixture.html` (gitignored). Add it to `.env` at the
workspace root — see [`.env.example`](../.env.example):

```
NFCE_FIXTURE=data/nfce-fixture.html
```

These tests assert invariants that hold for *any* PR note rather than one
receipt's values — the chave cross-check passes, line totals sum to the note
total, every item is well formed, money is integer cents — so they work against
whatever note you captured. If `NFCE_FIXTURE` is set but the file is missing,
the suite fails loudly rather than quietly skipping.

## Design notes

- **Money is integer cents.** Parsing goes from the pt-BR decimal _string_
  straight to cents (`src/ptbr.ts`), so no binary float ever holds a price —
  `54,5` is exactly `5450`. Quantities are `REAL` because they are often
  fractional (`0,412 Kg`).
- **Idempotent on the chave.** Re-ingesting upserts the note and fully replaces
  its items in one transaction. `created_at` keeps the first-seen timestamp;
  `fetched_at` tracks the latest scrape.
- **Items are never deduped.** The same product legitimately repeats across
  lines, so print order (`n_item`) is the only key.
- **The chave is a checksum on the scrape.** It encodes the emitente CNPJ, série
  and número; `src/crosscheck.ts` compares them to the scraped values and warns
  on mismatch — an early signal that the portal's layout changed.
- **CPF is stored deliberately.** Claimed notes can yield cashback under state
  programs. A populated `consumer_cpf` means "claimed", null means "unclaimed",
  so that signal survives if the raw value is later hashed or dropped.
- **State routing.** `parse(html, uf)` in `src/parsers/index.ts` is the seam;
  `parsePR` is the only implementation. Adding a state means adding a parser and
  one map entry.

## Layout

```
src/
  app.ts             Hono routes
  server.ts          entry point
  chave.ts           extract / validate / decode the 44-digit key (+ mod-11 DV)
  ptbr.ts            pt-BR number, money and date parsing
  crosscheck.ts      parsed values vs. the chave's encoded fields
  db.ts              schema, idempotent upsert, reads
  fetcher.ts         charset-aware fetch of the scanned URL
  parsers/
    index.ts         UF router
    pr.ts            Paraná DANFE parser
test/
  fixture.ts                loads NFCE_FIXTURE, or reports why tests skipped
scripts/
  capture-fixture.ts        saves a note to data/ so the tests have one
```
