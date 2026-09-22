# Finance API — Implementation Plan

This document is the complete specification for building the backend of a self-hosted personal/business finance app. It is written for an implementing agent. Every decision below has been made deliberately; do not substitute alternatives. If something is ambiguous or missing, stop and ask rather than invent behavior.

---

## 1. Context and goals

- **API-first.** Build the whole backend without a frontend. The frontend comes later and will consume the OpenAPI contract.
- **Self-hosted** on a home server via Docker Compose. Single instance, low traffic.
- **No authentication for now.** Users are just names; the frontend will let people switch between users freely.
- **Model reality closely.** Accounts map to real-world entities (e.g. "Amazon BR" and "Amazon US" are different accounts because they are different companies with different currencies).

## 2. Core concepts

### 2.1 Everything is a transaction

There is no separate "income" or "expense" type. Every movement of value is a **transaction** from one account to another. Direction is expressed only by `from` and `to`.

### 2.2 Account kinds

| Kind        | Meaning                                                                 | Created by |
|-------------|-------------------------------------------------------------------------|------------|
| `managed`   | Money the user holds and tracks: bank accounts, credit cards, cash, wallets. | User |
| `unmanaged` | The outside world: counterparties (e.g. "Amazon BR", "Employer") or categories (e.g. "Food"). How users use them is up to them. | User |
| `system`    | Internal accounts the server needs, e.g. "Opening Balance BRL". Can be hidden by the UI. | Server only |

An account is a **name**, a **kind**, and a **currency**. Every account, including unmanaged and system ones, has exactly one currency.

### 2.3 Transactions

A transaction has a name, a `from` account, a `to` account, a **from value** (in the from account's currency) and a **to value** (in the to account's currency).

- Same currency on both sides → the two values must be equal.
- Different currencies → the values differ, and together they record the exchange that happened.

Examples:

| Scenario | From | To | From value | To value |
|---|---|---|---|---|
| Salary | Employer (unmanaged, BRL) | Nubank (managed, BRL) | 8000.00 | 8000.00 |
| Grocery purchase | Nubank (managed, BRL) | Supermarket (unmanaged, BRL) | 250.00 | 250.00 |
| Transfer to savings | Nubank (managed, BRL) | Savings (managed, BRL) | 1000.00 | 1000.00 |
| Credit card purchase | Credit Card (managed, BRL) | Amazon BR (unmanaged, BRL) | 300.00 | 300.00 |
| Paying the card bill | Nubank (managed, BRL) | Credit Card (managed, BRL) | 300.00 | 300.00 |
| International purchase | Credit Card (managed, BRL) | Amazon US (unmanaged, USD) | 500.00 BRL | 92.00 USD |
| IOF on that purchase | Credit Card (managed, BRL) | Receita Federal (unmanaged, BRL) | 17.50 | 17.50 |
| Opening balance | Opening Balance BRL (system) | Nubank (managed, BRL) | 3200.00 | 3200.00 |
| Card starting with debt | Credit Card (managed, BRL) | Opening Balance BRL (system) | 1500.00 | 1500.00 |

Fees are always their own transaction. A credit card is just a managed account whose balance goes negative; there is no special account subtype.

### 2.4 Spaces (tenancy)

All financial data lives in a **space**. Users are global and join spaces through memberships with a role. One user can belong to many spaces (e.g. a personal/household space and a business space).

Transactions never cross spaces. Moving money between spaces is recorded as two independent transactions, one in each space, each against a local unmanaged account representing the other side. (Future work may link these; see §15.)

## 3. Stack

| Concern | Choice |
|---|---|
| Package manager / workspace | **pnpm** workspaces |
| Runtime | **Bun** |
| Language | TypeScript (strict) |
| HTTP framework | **Hono** with **@hono/zod-openapi** |
| Validation / contracts | **Zod** |
| Database | **PostgreSQL 17** |
| ORM / migrations | **Drizzle ORM** + **drizzle-kit**, driver `postgres` (postgres.js) via `drizzle-orm/postgres-js` |
| Tests | **bun test** |
| API docs UI | Scalar (`@scalar/hono-api-reference`) at `/docs` |
| Deployment | Docker Compose, `oven/bun` base image |

Dependencies are installed with pnpm; scripts are executed with Bun.

## 4. Repository layout

```
/
├── package.json                 # root scripts, private
├── pnpm-workspace.yaml          # apps/*, packages/*
├── docker-compose.yml
├── .env.example
├── apps/
│   └── api/
│       ├── package.json
│       ├── bunfig.toml          # [test] preload = ["./test/setup.ts"]
│       ├── drizzle.config.ts
│       ├── Dockerfile
│       ├── src/
│       │   ├── index.ts         # Bun.serve entry
│       │   ├── app.ts           # Hono app assembly (exported for tests)
│       │   ├── env.ts           # env parsing with Zod
│       │   ├── db/
│       │   │   ├── client.ts
│       │   │   ├── schema.ts
│       │   │   ├── seed-currencies.ts
│       │   │   ├── demo/
│       │   │   │   ├── ledger.ts    # demo data as typed constants (§13)
│       │   │   │   └── seed.ts      # demo seed runner
│       │   │   └── migrations/
│       │   ├── lib/
│       │   │   ├── money.ts     # string <-> bigint helpers, validation
│       │   │   ├── cursor.ts    # opaque cursor encode/decode
│       │   │   ├── errors.ts    # problem+json helpers, AppError
│       │   │   └── audit.ts     # writeAudit(tx, entry)
│       │   ├── middleware/
│       │   │   ├── acting-user.ts   # resolves X-User-Id
│       │   │   └── space-access.ts  # membership + role check
│       │   └── modules/
│       │       ├── health/
│       │       ├── users/
│       │       ├── spaces/
│       │       ├── members/
│       │       ├── currencies/
│       │       ├── accounts/
│       │       ├── transactions/
│       │       ├── balances/
│       │       └── audit-log/
│       │           # each module: routes.ts (OpenAPI routes) + service.ts (logic)
│       └── test/
│           ├── setup.ts
│           ├── helpers.ts       # factories: createUser, createSpace, createAccount...
│           └── demo-seed.test.ts  # acceptance test against §13.5
└── packages/
    └── contracts/
        ├── package.json         # "exports": { ".": "./src/index.ts" } (no build step)
        └── src/                 # Zod schemas + inferred types shared with the future frontend
```

Business logic lives in `service.ts` files and receives a Drizzle transaction handle so that audit writes and data writes share one DB transaction. Route files only parse input, call services, and shape output.

## 5. Environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Main database |
| `DATABASE_URL_TEST` | Disposable test database |
| `PORT` | HTTP port (default `3000`) |
| `APP_VERSION` | Injected at Docker build time (git tag or short SHA); falls back to `apps/api/package.json` version |

## 6. Data model

Conventions:

- Primary keys are **UUIDv7**, generated in the application.
- **All timestamps are stored in UTC** (`timestamptz`) and always returned in UTC as ISO 8601 with `Z`. The backend never stores or returns local time; clients convert to local time for display.
- Money is `bigint` in **minor units** of the account's currency. Never use floats or JS `number` for money anywhere. postgres.js returns `int8`/`numeric` as strings; keep them as strings or convert to `BigInt`.
- JSON field names are `snake_case`.

```sql
users (
  id          uuid PRIMARY KEY,
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
)

spaces (
  id          uuid PRIMARY KEY,
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
)

space_members (
  space_id    uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('owner','editor','viewer')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (space_id, user_id)
)

currencies (
  code        text PRIMARY KEY,            -- ISO 4217, e.g. 'BRL'
  name        text NOT NULL,
  minor_units smallint NOT NULL CHECK (minor_units BETWEEN 0 AND 18)
)
-- Seeded from active ISO 4217 currencies by a migration or seed script. Read-only via API.

accounts (
  id            uuid PRIMARY KEY,
  space_id      uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  kind          text NOT NULL CHECK (kind IN ('managed','unmanaged','system')),
  currency_code text NOT NULL REFERENCES currencies(code),
  system_key    text NULL,                  -- e.g. 'opening_balance'; only for kind = 'system'
  archived_at   timestamptz NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'system') = (system_key IS NOT NULL)),
  UNIQUE (id, space_id)                     -- target for composite FKs below
)
CREATE UNIQUE INDEX accounts_space_name_uq   ON accounts (space_id, lower(name));
CREATE UNIQUE INDEX accounts_space_system_uq ON accounts (space_id, system_key, currency_code)
  WHERE system_key IS NOT NULL;

transactions (
  id               uuid PRIMARY KEY,
  space_id         uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  name             text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  from_account_id  uuid NOT NULL,
  to_account_id    uuid NOT NULL,
  from_value       bigint NOT NULL CHECK (from_value > 0),
  to_value         bigint NOT NULL CHECK (to_value > 0),
  occurred_at      timestamptz NOT NULL,
  notes            text NULL,
  created_by       uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (from_account_id <> to_account_id),
  -- Composite FKs guarantee both accounts belong to the transaction's space.
  -- NO ACTION (not RESTRICT) so that deleting a space can cascade to both tables.
  FOREIGN KEY (from_account_id, space_id) REFERENCES accounts(id, space_id) ON DELETE NO ACTION,
  FOREIGN KEY (to_account_id,   space_id) REFERENCES accounts(id, space_id) ON DELETE NO ACTION
)
CREATE INDEX transactions_from_idx  ON transactions (from_account_id, occurred_at);
CREATE INDEX transactions_to_idx    ON transactions (to_account_id, occurred_at);
CREATE INDEX transactions_space_idx ON transactions (space_id, occurred_at DESC, id DESC);

audit_log (
  id           uuid PRIMARY KEY,
  space_id     uuid NULL REFERENCES spaces(id) ON DELETE CASCADE,  -- NULL for user-level events
  entity_type  text NOT NULL CHECK (entity_type IN ('user','space','space_member','account','transaction')),
  entity_id    text NOT NULL,               -- uuid, or "space_id:user_id" for memberships
  action       text NOT NULL CHECK (action IN ('create','update','delete')),
  before       jsonb NULL,
  after        jsonb NULL,
  actor_id     uuid NULL,                   -- no FK: survives user deletion
  actor_name   text NULL,                   -- snapshot of the actor's name at write time
  at           timestamptz NOT NULL DEFAULT now()
)
CREATE INDEX audit_space_idx  ON audit_log (space_id, at DESC, id DESC);
CREATE INDEX audit_entity_idx ON audit_log (entity_type, entity_id, at DESC);
```

## 7. Business rules

Rules marked **(DB)** are also enforced by the schema; all others are enforced in services. Every rule must have a test that proves violations are rejected.

### 7.1 Transactions (validated on create and on every update, against the merged result)

1. Both accounts belong to the transaction's space. **(DB)**
2. `from_account_id ≠ to_account_id`. **(DB)**
3. **At least one side is a `managed` account.** This single rule allows system→managed, managed→system, managed↔unmanaged and managed→managed, and rejects unmanaged↔unmanaged, system↔unmanaged and system↔system.
4. If both accounts share a currency, `from_value` must equal `to_value`.
5. Values are positive integers in minor units, within signed 64-bit range. **(DB for > 0)**
6. A transaction may not newly reference an archived account. Editing other fields of an existing transaction that already references an archived account is allowed.
7. On create, if both accounts share a currency and `to_value` is omitted, it defaults to `from_value`. If currencies differ, both values are required.
8. `occurred_at` defaults to now if omitted.

### 7.2 Accounts

1. Clients may create only `managed` and `unmanaged` accounts. Creating `system` is rejected (422).
2. `kind` is immutable (422 if present in PATCH).
3. `currency_code` is changeable only while the account has no transactions (409 otherwise).
4. Deleting an account that is referenced by any transaction is rejected (409); archive instead via `PATCH { "archived": true }`.
5. System accounts cannot be updated or deleted through the API (403).
6. Names are unique per space, case-insensitively. **(DB)**

### 7.3 System accounts and opening balances

1. Whenever a `managed` account is created (or its currency changes) in currency `X`, ensure the space has a system account with `system_key = 'opening_balance'`, currency `X`, named `Opening Balance X`. Use `INSERT ... ON CONFLICT DO NOTHING` inside the same DB transaction.
2. `POST /accounts` for a `managed` account accepts optional `opening_balance: { value, occurred_at? }`:
   - `value` is a **signed** integer string in minor units; zero means no transaction is created.
   - Positive → transaction `Opening Balance X → new account`. Negative → `new account → Opening Balance X` with the absolute value.
   - Transaction name `"Opening balance"`, `occurred_at` defaults to now.
   - Created in the same DB transaction as the account, with its own audit row.
3. `opening_balance` on an `unmanaged` account is rejected (422).

### 7.4 Users

1. Creating a user requires only a name. It does not require `X-User-Id`.
2. Deleting a user is rejected (409) while they are the only owner of any space. Otherwise their memberships are removed. Their audit rows keep `actor_id` and `actor_name`; `transactions.created_by` becomes NULL.

### 7.5 Spaces and members

1. The user who creates a space becomes its `owner`. No accounts are created until the first managed account (see 7.3).
2. A space must always have at least one owner. Demoting or removing the last owner is rejected (409). A member may remove themselves unless they are the last owner.
3. A user can be added to a space only once. **(DB)**
4. Deleting a space (owner only) permanently deletes everything in it: members, accounts, transactions and the space's audit log. No audit row is written for the deletion, and nothing about the space remains afterwards.

### 7.6 Audit

Every create, update and delete on users, spaces, memberships, accounts and transactions writes an audit row (except space deletion, see 7.5.4) **in the same DB transaction** via `writeAudit(tx, { space_id, entity_type, entity_id, action, before, after, actor })`. `before` is null on create; `after` is null on delete. Snapshots are the entity's API representation.

## 8. Identity and permissions

### 8.1 Acting user

- Every request except `POST /v1/users`, `GET /health`, `/docs` and `/v1/openapi.json` must send `X-User-Id: <uuid>`.
- Missing, malformed or unknown → **401** `unauthenticated`.
- The resolved user is placed in Hono context for permissions and audit.
- This is intentionally unauthenticated and suitable for a trusted home network only. Real auth later must only replace this middleware.

### 8.2 Space roles

| Action | viewer | editor | owner |
|---|:-:|:-:|:-:|
| Read space, accounts, transactions, balances, audit log, members | ✓ | ✓ | ✓ |
| Create/update/delete accounts and transactions | | ✓ | ✓ |
| Rename space, manage members | | | ✓ |
| Delete space | | | ✓ |

- Acting user not a member of the space → **404** (the space is treated as not found).
- Member without sufficient role → **403** `forbidden`.
- Users endpoints are global: any acting user may list, view, create, rename and delete users (subject to 7.4).

## 9. API conventions

- Versioned prefix `/v1` for everything except `/health` and `/docs`.
- OpenAPI 3.1 generated from Zod schemas, served at `/v1/openapi.json`; Scalar UI at `/docs`.
- JSON bodies and responses, `snake_case` fields.
- **Money in JSON is always a string of integer minor units**, e.g. `"from_value": "12345"` for 123.45 BRL. Transaction values match `^[1-9][0-9]*$`; `opening_balance.value` matches `^-?[0-9]+$`; both must fit in signed 64-bit. Responses include the currency code next to every value.
- **Timestamps are UTC only, in both directions.** Every timestamp a client sends (bodies and query parameters: `occurred_at`, `at`, `from`, `to`, `edges`) must be ISO 8601 ending in `Z`, e.g. `2026-09-20T17:30:00Z`. Any other form, including local offsets like `-03:00` and timestamps without an offset, is rejected with 422. Output is always UTC with `Z`. Converting local input to UTC, and UTC output to local display, is entirely the client's job; this applies to reports as well (see §10.9).
- **Pagination** (lists that can grow): query `cursor` (opaque base64url) and `limit` (default 50, max 200). Response shape `{ "data": [...], "next_cursor": "..." | null }`. Ordering and cursor key are `(occurred_at DESC, id DESC)` for transactions and `(at DESC, id DESC)` for audit log.
- Small lists (users, spaces, members, accounts, currencies) return `{ "data": [...] }` without pagination.
- **Errors** use `application/problem+json` (RFC 9457):

```json
{
  "type": "about:blank",
  "title": "Validation failed",
  "status": 422,
  "code": "validation_error",
  "detail": "Accounts share currency BRL but values differ.",
  "errors": [{ "path": "to_value", "message": "Must equal from_value (12345)." }]
}
```

| Status | `code` | When |
|---|---|---|
| 400 | `bad_request` | Malformed JSON, invalid cursor |
| 401 | `unauthenticated` | Missing/unknown `X-User-Id` |
| 403 | `forbidden` | Insufficient role; touching system accounts |
| 404 | `not_found` | Resource missing or space not visible to user |
| 409 | `conflict` | Last owner, account in use, duplicate name, currency locked |
| 422 | `validation_error` | Schema or business-rule violation |
| 500 | `internal_error` | Unexpected |

## 10. Endpoints

### 10.1 Health

```
GET /health
200 { "status": "ok",    "version": "0.1.0" }
503 { "status": "error", "version": "0.1.0" }
```

`status` reflects `SELECT 1` against Postgres. No auth header required.

### 10.2 Users

```
GET    /v1/users                 → { data: User[] }
POST   /v1/users                 { name }            → 201 User   (no X-User-Id needed)
GET    /v1/users/:id             → User
PATCH  /v1/users/:id             { name }            → User
DELETE /v1/users/:id             → 204
```

`User = { id, name, created_at, updated_at }`

### 10.3 Currencies

```
GET /v1/currencies               → { data: [{ code, name, minor_units }] }
```

### 10.4 Spaces

```
GET    /v1/spaces                → { data: Space[] }   (only spaces the acting user belongs to)
POST   /v1/spaces                { name }            → 201 Space  (acting user becomes owner)
GET    /v1/spaces/:sid           → Space
PATCH  /v1/spaces/:sid           { name }            → Space      (owner)
DELETE /v1/spaces/:sid           → 204                             (owner)
```

`Space = { id, name, role, created_at, updated_at }` where `role` is the acting user's role.

### 10.5 Members

```
GET    /v1/spaces/:sid/members          → { data: Member[] }
POST   /v1/spaces/:sid/members          { user_id, role }   → 201 Member   (owner)
PATCH  /v1/spaces/:sid/members/:uid     { role }            → Member       (owner)
DELETE /v1/spaces/:sid/members/:uid     → 204   (owner, or the member themselves)
```

`Member = { user_id, user_name, role, created_at }`

### 10.6 Accounts

```
GET    /v1/spaces/:sid/accounts         ?kind=managed|unmanaged|system
                                        &currency=BRL
                                        &archived=false|true|all   (default false)
                                        → { data: Account[] }
POST   /v1/spaces/:sid/accounts         → 201 Account
GET    /v1/spaces/:sid/accounts/:id     → Account
PATCH  /v1/spaces/:sid/accounts/:id     { name?, currency_code?, archived? } → Account
DELETE /v1/spaces/:sid/accounts/:id     → 204
```

Create body:

```json
{
  "name": "Nubank",
  "kind": "managed",
  "currency_code": "BRL",
  "opening_balance": { "value": "320000", "occurred_at": "2026-09-01T00:00:00Z" }
}
```

`Account = { id, space_id, name, kind, currency_code, system_key, archived_at, created_at, updated_at }`

### 10.7 Transactions

```
GET    /v1/spaces/:sid/transactions     ?account_id=   (matches either side)
                                        &from=         (occurred_at >=, inclusive)
                                        &to=           (occurred_at <,  exclusive)
                                        &q=            (case-insensitive substring on name)
                                        &cursor=&limit=
                                        → { data: Transaction[], next_cursor }
POST   /v1/spaces/:sid/transactions     → 201 Transaction
GET    /v1/spaces/:sid/transactions/:id → Transaction
PATCH  /v1/spaces/:sid/transactions/:id (any subset of create fields) → Transaction
DELETE /v1/spaces/:sid/transactions/:id → 204
```

Create body:

```json
{
  "name": "Amazon order #123",
  "from_account_id": "…",
  "to_account_id": "…",
  "from_value": "50000",
  "to_value": "9200",
  "occurred_at": "2026-09-20T17:30:00Z",
  "notes": "Keyboard"
}
```

Response:

```json
{
  "id": "…",
  "space_id": "…",
  "name": "Amazon order #123",
  "from_account_id": "…",
  "from_value": "50000",
  "from_currency": "BRL",
  "to_account_id": "…",
  "to_value": "9200",
  "to_currency": "USD",
  "occurred_at": "2026-09-20T17:30:00Z",
  "notes": "Keyboard",
  "created_by": "…",
  "created_at": "…",
  "updated_at": "…"
}
```

### 10.8 Balances

Balances are **computed on read** from transactions. No cached balances, no snapshots. Keep the computation behind a single service function so the strategy can change later without API changes.

Balance of account `A` at time `T`:

```sql
SELECT
  COALESCE(SUM(to_value)   FILTER (WHERE to_account_id   = $A), 0)
- COALESCE(SUM(from_value) FILTER (WHERE from_account_id = $A), 0) AS balance
FROM transactions
WHERE (from_account_id = $A OR to_account_id = $A)
  AND occurred_at <= $T;
```

Works for all kinds: an unmanaged account's balance is the net amount that has flowed to it (e.g. total spent at "Amazon BR"); system accounts are typically negative.

```
GET /v1/spaces/:sid/accounts/:id/balance
    ?at=   (default now, inclusive)
    → { account_id, currency, balance: "123456", at }

POST /v1/spaces/:sid/accounts/:id/balance-history
    { edges: [...] }                    (see §10.9)

GET /v1/spaces/:sid/balances
    ?at=   (default now)
    → {
        at,
        accounts: [{ account_id, name, currency, archived, balance }],  // all managed accounts
        totals:   [{ currency, balance }]                               // managed only, per currency
      }
```

Totals are **never converted** across currencies. The answer to "how much do I have" is a list like 1000 BRL, 200 USD, 50 EUR.

The balances service exposes two primitives, and every balance endpoint is built on them:

- `balanceAt(accountId, instant)`: includes transactions with `occurred_at <= instant` (the SQL above).
- `balanceBefore(accountId, instant)`: includes transactions with `occurred_at < instant`.

### 10.9 Balance history

Returns an account's balance over a series of periods, for charts and period summaries. The backend has **no notion of timezones or calendars**: the client decides where each period starts and ends, converts those boundaries to UTC, and sends them as a list of **edges**. For example, "June to August, monthly, in São Paulo" becomes four UTC edges: `2026-06-01T03:00:00Z`, `2026-07-01T03:00:00Z`, `2026-08-01T03:00:00Z`, `2026-09-01T03:00:00Z`.

The request is a read-only `POST` because a year of daily edges does not fit comfortably in a query string. It writes nothing and is allowed for viewers.

```
POST /v1/spaces/:sid/accounts/:id/balance-history
{ "edges": ["2026-06-01T03:00:00Z", "2026-07-01T03:00:00Z",
            "2026-08-01T03:00:00Z", "2026-09-01T03:00:00Z"] }
```

**Rules:**

1. `edges` contains between **2 and 367** UTC timestamps (1 to 366 periods), each ending in `Z`, in **strictly increasing** order. Anything else → 422.
2. Each pair of consecutive edges defines one period, `[edges[i], edges[i+1])`: start inclusive, end exclusive. Periods may have different lengths (months, weeks, custom ranges all work).
3. `starting_balance` = `balanceBefore(account, edges[0])`.
4. For each period:
   - `inflow` = sum of `to_value` of transactions **into** the account during the period.
   - `outflow` = sum of `from_value` of transactions **out of** the account during the period.
   - `balance` = closing balance at the end of the period = `starting_balance` + cumulative (`inflow` − `outflow`) up to and including this period.
5. **Every period is returned**, including empty periods and periods in the future. Their balance carries forward unchanged.
6. Invariant: the last point's `balance` equals `balanceBefore(account, edges[last])`.

**Response:**

```json
{
  "account_id": "…",
  "currency": "BRL",
  "starting_balance": "0",
  "points": [
    {
      "period_start": "2026-06-01T03:00:00Z",
      "period_end": "2026-07-01T03:00:00Z",
      "inflow": "150000",
      "outflow": "223550",
      "balance": "-73550"
    }
  ]
}
```

Points carry no labels; the client already knows what each period means and renders it in local time.

**Reference query** (`$edges` is a `timestamptz[]`):

```sql
WITH periods AS (
  SELECT e AS period_start, lead(e) OVER (ORDER BY e) AS period_end
  FROM unnest($edges::timestamptz[]) AS e
),
buckets AS (
  SELECT period_start, period_end FROM periods WHERE period_end IS NOT NULL
),
movements AS (
  SELECT
    b.period_start,
    SUM(t.to_value)   FILTER (WHERE t.to_account_id   = $A) AS inflow,
    SUM(t.from_value) FILTER (WHERE t.from_account_id = $A) AS outflow
  FROM buckets b
  JOIN transactions t
    ON t.occurred_at >= b.period_start
   AND t.occurred_at <  b.period_end
   AND (t.from_account_id = $A OR t.to_account_id = $A)
  GROUP BY b.period_start
)
SELECT
  b.period_start,
  b.period_end,
  COALESCE(m.inflow, 0)  AS inflow,
  COALESCE(m.outflow, 0) AS outflow,
  $starting_balance
    + SUM(COALESCE(m.inflow, 0) - COALESCE(m.outflow, 0))
      OVER (ORDER BY b.period_start) AS balance
FROM buckets b
LEFT JOIN movements m USING (period_start)
ORDER BY b.period_start;
```

**Required tests:**

- Month-boundary case: the same transaction lands in different periods depending on the edges sent (São Paulo month edges at `03:00Z` vs. UTC month edges at `00:00Z`). The demo seed in §13 contains exactly this case.
- Periods of unequal length (e.g. calendar months) are summed correctly.
- Empty and future periods carry the balance forward.
- `starting_balance` includes only transactions before `edges[0]`.
- A transaction exactly on an edge belongs to the period that starts there.
- The invariant in rule 6 holds.
- Fewer than 2 or more than 367 edges, non-increasing or duplicate edges, and edges without `Z` return 422.

### 10.10 Audit log

```
GET /v1/spaces/:sid/audit-log   ?entity_type=&entity_id=&cursor=&limit=
    → { data: [{ id, entity_type, entity_id, action, before, after,
                 actor_id, actor_name, at }], next_cursor }
```

Readable by any member. User-level entries (`space_id` NULL) are not exposed in this milestone.

## 11. Testing

- Runner: **bun test**. `apps/api/bunfig.toml` sets `[test] preload = ["./test/setup.ts"]`.
- `setup.ts` connects to `DATABASE_URL_TEST` and runs Drizzle migrations plus the currency seed once before the suite.
- Isolation: each test runs inside a DB transaction that rolls back at the end. Tests that must observe committed state (e.g. audit written atomically with data, cascade deletes) truncate tables instead.
- Prefer HTTP-level tests via `app.request()` (no server needed), sending `X-User-Id`. Use `test/helpers.ts` factories for setup.
- Every rule in §7 and every permission cell in §8.2 needs at least one test proving the rejection and one proving the allowed path.
- Money tests must cover values above 2^53 to prove no precision loss.

## 12. Deployment

`docker-compose.yml`:

- `db`: `postgres:17`, named volume, with an init script that also creates the test database.
- `api`: built from `apps/api/Dockerfile` on `oven/bun`, `APP_VERSION` passed as a build arg, runs migrations then starts the server.
- Healthcheck for `api` without curl: `bun -e "fetch('http://localhost:3000/health').then(r => process.exit(r.ok ? 0 : 1))"`.

Root scripts (run with Bun, via pnpm):

| Script | Does |
|---|---|
| `dev` | `bun --watch apps/api/src/index.ts` |
| `test` | `bun test` in `apps/api` |
| `typecheck` | `tsc --noEmit` across the workspace |
| `db:generate` | `drizzle-kit generate` |
| `db:migrate` | apply migrations |
| `seed:demo` | `bun run apps/api/src/db/demo/seed.ts` (see §13) |

## 13. Demo seed

A script that fills the database with a realistic, **fully deterministic** dataset. It serves three purposes: a playground for exploring the API through `/docs`, sample data for building the frontend later, and an end-to-end acceptance test with known expected numbers.

### 13.1 Behavior

- Files: `apps/api/src/db/demo/ledger.ts` (the data, as typed constants) and `apps/api/src/db/demo/seed.ts` (the runner).
- **Writes go through the service layer, not raw inserts**, so every business rule, system-account creation and audit row is exercised exactly as it would be through the API. Each write uses the specified acting user.
- No randomness. Every value and timestamp is fixed so the expected results below always hold.
- Demo entities are marked with a `(demo)` suffix in user and space names.
- If any space whose name ends in `(demo)` exists, the script aborts with a message unless run with `--reset`. `--reset` deletes those spaces (cascade, §7.5.4) and the users whose names end in `(demo)`, then recreates everything.
- Prints a summary at the end: created users, spaces, account and transaction counts, and the managed totals per currency for each space.
- Amounts below are written in major units for readability. In `ledger.ts` they are integer minor-unit strings (e.g. `"1532.40"` → `"153240"`).
- All timestamps are UTC. Rows that give only a date happen at `15:00Z` on that date.

### 13.2 Users and spaces

| User | Casa (demo) | Estúdio Ana (demo) |
|---|---|---|
| Ana (demo) | owner | owner |
| Bruno (demo) | editor | viewer |
| Carla (demo) | — | — |

Carla has no memberships, to verify that spaces are only visible to members. Both spaces are created by Ana.

### 13.3 Space "Casa (demo)"

**Managed accounts** (created by Ana, opening balances dated `2026-06-01T03:00Z`):

| Account | Currency | Opening balance |
|---|---|---|
| Nubank | BRL | 3200.00 |
| Poupança | BRL | 10000.00 |
| Cartão de Crédito | BRL | −1500.00 |
| Wise USD | USD | 250.00 |
| Banco Antigo | BRL | 800.00 |

**Unmanaged accounts:** Empregador (BRL), Imobiliária (BRL), Supermercado (BRL), Companhia de Energia (BRL), iFood (BRL), Amazon BR (BRL), Amazon US (USD), Receita Federal (BRL), Estúdio Ana (BRL).

**System accounts** (created automatically): Opening Balance BRL, Opening Balance USD.

**Monthly transactions** for June, July and August 2026:

| Day | Name | From → To | Value | Actor |
|---|---|---|---|---|
| 05 | Salário | Empregador → Nubank | 8000.00 | Ana |
| 06 | Aluguel | Nubank → Imobiliária | 2200.00 | Ana |
| 10 | Pagamento fatura | Nubank → Cartão de Crédito | Jun 1500.00 · Jul 735.50 · Aug 1532.40 | Ana |
| 12 | Supermercado | Cartão de Crédito → Supermercado | 650.00 | Bruno |
| 20 | Energia | Nubank → Companhia de Energia | 180.00 | Ana |
| 25 | Reserva | Nubank → Poupança | 1000.00 | Ana |

Each card payment settles the previous month's card balance exactly.

**One-off transactions:**

| # | When | Name | From → To | From value | To value | Notes |
|---|---|---|---|---|---|---|
| 1 | 2026-06-03 | Encerramento conta | Banco Antigo → Nubank | 800.00 | 800.00 | Afterwards, archive Banco Antigo (balance 0) |
| 2 | 2026-06-15 | Jantar | Cartão de Crédito → iFood | 85.50 | 85.50 | |
| 3 | 2026-07-08 | Pedido Amazon | Cartão de Crédito → Amazon BR | 300.00 | 300.00 | |
| 4 | 2026-07-14 | Teclado | Cartão de Crédito → Amazon US | 500.00 BRL | 92.00 USD | Cross-currency |
| 5 | 2026-07-14 | IOF | Cartão de Crédito → Receita Federal | 17.50 | 17.50 | Fee as its own transaction |
| 6 | **2026-08-01T01:30Z** | Pizza | Cartão de Crédito → iFood | 64.90 | 64.90 | 31 July 22:30 in São Paulo; August in UTC |
| 7 | 2026-08-03 | Conversão | Wise USD → Nubank | 100.00 USD | 545.00 BRL | Cross-currency |
| 8 | 2026-08-05 | Pró-labore | Estúdio Ana → Nubank | 4000.00 | 4000.00 | Mirrors the business space |
| 9 | 2026-08-18 | Feira | Nubank → Supermercado | 120.00 | 120.00 | Then **PATCH** `from_value` and `to_value` to 210.00 (produces an `update` audit row) |
| 10 | 2026-08-22 | Lanche | Nubank → iFood | 50.00 | 50.00 | Then **DELETE** (produces a `delete` audit row) |

Resulting counts: 32 transactions remaining (5 opening + 18 monthly + 9 one-offs), 5 managed, 9 unmanaged and 2 system accounts.

### 13.4 Space "Estúdio Ana (demo)"

All writes by Ana.

**Managed accounts:** Conta PJ (BRL, opening balance 5000.00 on `2026-06-01T03:00Z`), Wise Business (USD, no opening balance).

**Unmanaged accounts:** Cliente Acme (BRL), Cliente Global Inc (USD), Contador (BRL), Ana (BRL).

**System accounts** (automatic): Opening Balance BRL, Opening Balance USD. The USD one is created even though Wise Business has no opening balance, because it is created with every new managed-account currency (§7.3).

| When | Name | From → To | From value | To value |
|---|---|---|---|---|
| 2026-06-20 | Projeto site | Cliente Acme → Conta PJ | 6000.00 | 6000.00 |
| 2026-07-15 | Projeto app | Cliente Global Inc → Wise Business | 1200.00 USD | 1200.00 USD |
| 2026-07-20 | Conversão | Wise Business → Conta PJ | 1000.00 USD | 5480.00 BRL |
| 2026-07-28 | Honorários contábeis | Conta PJ → Contador | 450.00 | 450.00 |
| 2026-08-05 | Pró-labore | Conta PJ → Ana | 4000.00 | 4000.00 |

Resulting count: 6 transactions.

### 13.5 Expected results

These are asserted by `apps/api/test/demo-seed.test.ts`, which runs the seed against the test database and checks every number below through the HTTP API. Balances are as of any instant after 2026-08-31.

**Casa (demo): all account balances**

| Account | Kind | Balance |
|---|---|---|
| Nubank | managed | 18427.10 BRL |
| Poupança | managed | 13000.00 BRL |
| Cartão de Crédito | managed | −650.00 BRL |
| Banco Antigo | managed (archived) | 0.00 BRL |
| Wise USD | managed | 150.00 USD |
| Opening Balance BRL | system | −12500.00 BRL |
| Opening Balance USD | system | −250.00 USD |
| Empregador | unmanaged | −24000.00 BRL |
| Imobiliária | unmanaged | 6600.00 BRL |
| Supermercado | unmanaged | 2160.00 BRL |
| Companhia de Energia | unmanaged | 540.00 BRL |
| iFood | unmanaged | 150.40 BRL |
| Amazon BR | unmanaged | 300.00 BRL |
| Amazon US | unmanaged | 92.00 USD |
| Receita Federal | unmanaged | 17.50 BRL |
| Estúdio Ana | unmanaged | −4000.00 BRL |

`GET /balances` totals for Casa: **30777.10 BRL** and **150.00 USD**.

**Estúdio Ana (demo): managed balances**

| Account | Balance |
|---|---|
| Conta PJ | 12030.00 BRL |
| Wise Business | 200.00 USD |

`GET /balances` totals: **12030.00 BRL** and **200.00 USD**.

**Ledger sanity checks** (the sum of all account balances per currency equals the net effect of cross-currency transactions):

- Casa BRL: +45.00 (−500.00 sent to USD in #4, +545.00 received from USD in #7).
- Casa USD: −8.00 (+92.00 received in #4, −100.00 sent in #7).
- Estúdio BRL: +5480.00. Estúdio USD: −1000.00.

**Balance history for Cartão de Crédito**, June to August by month, requested with two edge sets:

- São Paulo months: `2026-06-01T03:00:00Z`, `2026-07-01T03:00:00Z`, `2026-08-01T03:00:00Z`, `2026-09-01T03:00:00Z`
- UTC months: `2026-06-01T00:00:00Z`, `2026-07-01T00:00:00Z`, `2026-08-01T00:00:00Z`, `2026-09-01T00:00:00Z`

| Month | São Paulo edges (inflow / outflow / balance) | UTC edges (balance) |
|---|---|---|
| 2026-06 | 1500.00 / 2235.50 / −735.50 | −735.50 |
| 2026-07 | 735.50 / 1532.40 / −1532.40 | −1467.50 |
| 2026-08 | 1532.40 / 650.00 / −650.00 | −650.00 |

`starting_balance` is 0.00 in both cases. The July difference is transaction #6.

**Audit log:**

- Transaction #9 has exactly one `update` row, with `from_value` and `to_value` both `"12000"` in `before` and both `"21000"` in `after`.
- Transaction #10 has one `create` and one `delete` row and does not appear in the transaction list.
- Supermercado monthly transactions have `created_by` = Bruno; the audit rows name Bruno as actor.

**Visibility:**

- As Carla, `GET /v1/spaces` returns an empty list.
- As Bruno, creating a transaction in Estúdio Ana (demo) returns 403.

## 14. Build order

Each milestone ends with its tests passing and `typecheck` clean.

1. **Scaffold.** pnpm workspace, `apps/api`, `packages/contracts`, env parsing, Drizzle client, first migration, Hono app with problem+json error handler, OpenAPI at `/v1/openapi.json`, Scalar at `/docs`, `GET /health`, test harness, Dockerfile and Compose.
   *Done when:* `docker compose up` serves `/health` with status `ok`, and a smoke test passes under `bun test`.
2. **Identity and spaces.** Users CRUD, `X-User-Id` middleware, spaces CRUD, members, space-access middleware with roles, `writeAudit` helper wired into all of these.
   *Done when:* all §7.4, §7.5 and §8 rules are tested.
3. **Accounts.** Currency seed and endpoint, accounts CRUD, archiving, immutability rules, automatic system accounts, opening balance on create.
   *Done when:* all §7.2 and §7.3 rules are tested, with audit rows verified.
4. **Transactions.** CRUD with full §7.1 validation, list filters, cursor pagination.
   *Done when:* all §7.1 rules are tested for both create and update, and pagination is stable under same-timestamp rows.
5. **Balances.** Balance service function and the three balance endpoints.
   *Done when:* balances are correct across mixed kinds and currencies, `at` boundaries are inclusive, every required test in §10.9 passes, and values above 2^53 survive round trips.
6. **Hardening.** Audit-log endpoint, gap-filling tests for every permission cell, the demo seed (§13) with its acceptance test, README with run instructions.
   *Done when:* `seed:demo --reset` runs cleanly twice in a row, and `demo-seed.test.ts` asserts every expected number in §13.5.

## 15. Explicitly out of scope (do not build)

- Authentication, sessions, API tokens
- Transaction status (pending/cleared/reconciled)
- Recurring or scheduled transactions
- Idempotency keys
- Bank imports, `external_id`, OFX/CSV/Open Finance
- Balance caching or snapshots
- Reporting currency and exchange-rate tables
- Categories/tags as a separate concept
- `tax_id`/CNPJ on unmanaged accounts
- Multi-leg (split) transactions
- Custom (non-ISO) currencies or assets
- Linked accounts across spaces / automations that propose mirror transactions

None of these should be blocked by the design above; do not add schema for them speculatively.
