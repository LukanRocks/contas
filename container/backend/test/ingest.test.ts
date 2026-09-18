import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.ts";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, upsertNote, getNote, type DB } from "../src/db.ts";
import { parsePR } from "../src/parsers/pr.ts";
import type { ParsedNote } from "../src/types.ts";
import { html, skipWithoutFixture } from "./fixture.ts";

/** Structurally valid, entirely made up -- no real note is committed here. */
const SYNTHETIC_CHAVE = "41260112345678000199650010000001231123456782";
const NOT_A_NOTE = "<html><body>Nota nao encontrada</body></html>";

const qrUrl = (chave: string) => `https://www.fazenda.pr.gov.br/nfce/qrcode?p=${chave}%7C3%7C1`;

type Ctx = { after: (fn: () => void) => void };

/** Serve `body` instead of the portal; `null` simulates an unreachable host. */
function stubFetch(t: Ctx, body: string | null) {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    calls.push(String(input));
    if (body === null) throw new TypeError("fetch failed");
    return new Response(body, {
      status: 200,
      headers: { "content-type": "text/html; charset=UTF-8" },
    });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  return calls;
}

function freshDb(t: Ctx): DB {
  const db = openDb(":memory:");
  t.after(() => db.close());
  return db;
}

const counts = (db: DB) => ({
  notes: (db.prepare("SELECT COUNT(*) n FROM notes").get() as { n: number }).n,
  items: (db.prepare("SELECT COUNT(*) n FROM note_items").get() as { n: number }).n,
});

const postJson = (app: ReturnType<typeof createApp>, body: unknown) =>
  app.request("/api/nfce", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

/** The captured note, parsed once. Only for tests guarded by skipWithoutFixture. */
let cached: ParsedNote | null = null;
const note = (): ParsedNote => (cached ??= parsePR(html()));

/* ---------- always run: no note required ---------- */

test("POST /api/nfce rejects malformed bodies and URLs without a chave", async (t) => {
  const db = freshDb(t);
  const app = createApp(db);

  assert.equal((await postJson(app, {})).status, 400);
  assert.equal((await postJson(app, { url: "ftp://x/y" })).status, 400);
  assert.equal((await postJson(app, { url: "https://x/y?p=123|3|1" })).status, 400);
  assert.equal((await postJson(app, "not json")).status, 400);
  assert.deepEqual(counts(db), { notes: 0, items: 0 });
});

test("POST /api/nfce rejects an unsupported UF without fetching or storing", async (t) => {
  const db = freshDb(t);
  const calls = stubFetch(t, NOT_A_NOTE);
  const app = createApp(db);

  const spChave = "35" + SYNTHETIC_CHAVE.slice(2);
  const res = await postJson(app, { url: qrUrl(spChave) });

  assert.equal(res.status, 422);
  assert.equal(((await res.json()) as { uf: string }).uf, "35");
  assert.deepEqual(calls, [], "unsupported states never hit the network");
  assert.deepEqual(counts(db), { notes: 0, items: 0 });
});

test("POST /api/nfce returns 502 and stores nothing when the portal is unreachable", async (t) => {
  const db = freshDb(t);
  stubFetch(t, null);
  const app = createApp(db);

  const res = await postJson(app, { url: qrUrl(SYNTHETIC_CHAVE) });
  assert.equal(res.status, 502);
  assert.equal(((await res.json()) as { error: string }).error, "fetch_failed");
  assert.deepEqual(counts(db), { notes: 0, items: 0 });
});

test("POST /api/nfce returns 502 and stores nothing when the page cannot be parsed", async (t) => {
  const db = freshDb(t);
  stubFetch(t, NOT_A_NOTE);
  const app = createApp(db);

  const res = await postJson(app, { url: qrUrl(SYNTHETIC_CHAVE) });
  assert.equal(res.status, 502);
  assert.equal(((await res.json()) as { error: string }).error, "parse_failed");
  assert.deepEqual(counts(db), { notes: 0, items: 0 });
});

test("GET /api/nfce is empty before anything is ingested", async (t) => {
  const res = await createApp(freshDb(t)).request("/api/nfce");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { total: 0, limit: 200, offset: 0, notes: [] });
});

test("GET /api/nfce rejects bad paging", async (t) => {
  const app = createApp(freshDb(t));
  assert.equal((await app.request("/api/nfce?limit=0")).status, 400);
  assert.equal((await app.request("/api/nfce?limit=9999")).status, 400);
  assert.equal((await app.request("/api/nfce?offset=-1")).status, 400);
});

test("unknown notes 404 on both read routes", async (t) => {
  const app = createApp(freshDb(t));
  assert.equal((await app.request(`/api/nfce/${SYNTHETIC_CHAVE}`)).status, 404);
  assert.equal((await app.request(`/api/nfce/${SYNTHETIC_CHAVE}/html`)).status, 404);
  assert.equal((await app.request("/api/nfce/not-a-chave")).status, 400);
});

test("the front end is served at / and unknown API paths answer in JSON", async (t) => {
  const app = createApp(freshDb(t));

  const page = await app.request("/");
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type") ?? "", /text\/html/);
  assert.match(await page.text(), /<title>/);

  assert.equal((await app.request("/app.js")).status, 200);

  const missing = await app.request("/api/nope");
  assert.equal(missing.status, 404);
  assert.equal(((await missing.json()) as { error: string }).error, "not_found");
});

/* ---------- require NFCE_FIXTURE ---------- */

test("upsert stores the note and its items", { skip: skipWithoutFixture }, (t) => {
  const db = freshDb(t);
  const n = note();
  upsertNote(db, {
    ...n,
    source_url: qrUrl(n.chave),
    raw_html: html(),
    fetched_at: new Date().toISOString(),
  });
  assert.deepEqual(counts(db), { notes: 1, items: n.items.length });

  const stored = getNote(db, n.chave);
  assert.ok(stored);
  assert.equal(stored.emit_name, n.emit_name);
  assert.equal(stored.raw_html, html(), "raw_html holds the full fetched markup");
  assert.deepEqual(stored.items, n.items, "items round-trip through SQLite unchanged");
});

test("re-ingesting the same note does not duplicate rows", { skip: skipWithoutFixture }, (t) => {
  const db = freshDb(t);
  const n = note();
  const input = {
    ...n,
    source_url: qrUrl(n.chave),
    raw_html: html(),
    fetched_at: new Date().toISOString(),
  };
  upsertNote(db, input);
  const createdAt = getNote(db, n.chave)!.created_at;

  upsertNote(db, { ...input, fetched_at: "2027-01-01T00:00:00.000Z" });
  assert.deepEqual(counts(db), { notes: 1, items: n.items.length });

  const stored = getNote(db, n.chave)!;
  assert.equal(stored.fetched_at, "2027-01-01T00:00:00.000Z", "re-scrape refreshes fetched_at");
  assert.equal(stored.created_at, createdAt, "created_at keeps the first-seen timestamp");
});

test("POST /api/nfce ingests, stores and returns the parsed note", { skip: skipWithoutFixture }, async (t) => {
  const db = freshDb(t);
  const calls = stubFetch(t, html());
  const app = createApp(db);
  const n = note();

  const res = await postJson(app, { url: qrUrl(n.chave) });
  assert.equal(res.status, 200);
  assert.deepEqual(calls, [qrUrl(n.chave)], "fetches the scanned URL verbatim");

  assert.deepEqual(await res.json(), JSON.parse(JSON.stringify(n)));
  assert.deepEqual(counts(db), { notes: 1, items: n.items.length });
});

test("POST /api/nfce twice leaves a single note", { skip: skipWithoutFixture }, async (t) => {
  const db = freshDb(t);
  stubFetch(t, html());
  const app = createApp(db);
  const n = note();

  assert.equal((await postJson(app, { url: qrUrl(n.chave) })).status, 200);
  assert.equal((await postJson(app, { url: qrUrl(n.chave) })).status, 200);
  assert.deepEqual(counts(db), { notes: 1, items: n.items.length });
});

test("GET /api/nfce/:chave returns the stored note with its items", { skip: skipWithoutFixture }, async (t) => {
  const db = freshDb(t);
  stubFetch(t, html());
  const app = createApp(db);
  const n = note();
  await postJson(app, { url: qrUrl(n.chave) });

  const res = await app.request(`/api/nfce/${n.chave}`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as Record<string, unknown> & { items: unknown[] };
  assert.equal(body["chave"], n.chave);
  assert.equal(body["source_url"], qrUrl(n.chave));
  assert.equal(body["items"].length, n.items.length);
  assert.equal(body["raw_html_bytes"], Buffer.byteLength(html(), "utf8"));
  assert.ok(!("raw_html" in body), "the full markup is not echoed back");
  for (const item of body["items"] as Record<string, unknown>[]) {
    assert.ok(!("id" in item) && !("chave" in item), "items expose only parsed fields");
  }
});

test("GET /api/nfce lists notes newest first, as summaries", { skip: skipWithoutFixture }, async (t) => {
  const db = freshDb(t);
  stubFetch(t, html());
  const app = createApp(db);
  const n = note();
  await postJson(app, { url: qrUrl(n.chave) });

  // A second, older note so ordering is observable.
  const olderChave = n.chave.slice(0, 43) + (n.chave[43] === "9" ? "8" : "9");
  upsertNote(db, {
    ...n,
    chave: olderChave,
    emitted_at: "2020-01-01T10:00:00",
    source_url: qrUrl(olderChave),
    raw_html: html(),
    fetched_at: new Date().toISOString(),
  });

  const res = await app.request("/api/nfce");
  assert.equal(res.status, 200);
  const body = (await res.json()) as { total: number; notes: Record<string, unknown>[] };

  assert.equal(body.total, 2);
  assert.deepEqual(
    body.notes.map((row) => row["chave"]),
    [n.chave, olderChave],
    "newest emission first",
  );

  const [first] = body.notes;
  assert.equal(first!["item_count"], n.items.length, "summary carries the line count");
  assert.ok(!("raw_html" in first!), "list never ships the markup");
  assert.ok(!("items" in first!), "list is a summary, not the full note");
});

test("GET /api/nfce/:chave/html returns the captured page, sandboxed", { skip: skipWithoutFixture }, async (t) => {
  const db = freshDb(t);
  stubFetch(t, html());
  const app = createApp(db);
  const n = note();
  await postJson(app, { url: qrUrl(n.chave) });

  const res = await app.request(`/api/nfce/${n.chave}/html`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/html/);
  // Scraped third-party markup must never execute against our own origin.
  assert.equal(res.headers.get("content-security-policy"), "sandbox");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(await res.text(), html(), "serves the stored markup byte for byte");
});

test("GET /api/health reports ok while the database answers", async (t) => {
  const db = freshDb(t);
  const res = await createApp(db).request("/api/health");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: "ok" });
});

test("GET /api/health reports 503 when the database is gone", async (t) => {
  const db = freshDb(t);
  const app = createApp(db);
  db.close(); // simulate a wedged/unavailable database
  const res = await app.request("/api/health");
  assert.equal(res.status, 503);
  assert.equal(((await res.json()) as { status: string }).status, "error");
});

// Root ignores the permission bits this relies on.
const skipIfRoot = process.getuid?.() === 0 ? "permission checks do not apply to root" : false;

test("opening a database in an unwritable directory explains how to fix it", { skip: skipIfRoot }, (t) => {
  const dir = mkdtempSync(join(tmpdir(), "nfce-ro-"));
  chmodSync(dir, 0o500); // read + execute, but not writable
  t.after(() => {
    chmodSync(dir, 0o700);
    rmSync(dir, { recursive: true, force: true });
  });

  assert.throws(
    () => openDb(join(dir, "sub", "notes.db")),
    (err: Error) => {
      assert.match(err.message, /cannot open the database at/);
      assert.match(err.message, /writable/);
      assert.match(err.message, /bind-mounted/, "points at the Docker cause");
      return true;
    },
  );
});

/* ---------- ingest by chave (no QR URL available) ---------- */

test("POST /api/nfce accepts a chave printed in groups of four", { skip: skipWithoutFixture }, async (t) => {
  const db = freshDb(t);
  const calls = stubFetch(t, html());
  const app = createApp(db);
  const n = note();

  const grouped = n.chave.replace(/(\d{4})(?=\d)/g, "$1 ");
  assert.notEqual(grouped, n.chave, "the pasted form really does contain spaces");

  const res = await postJson(app, { chave: grouped });
  assert.equal(res.status, 200);
  assert.deepEqual(counts(db), { notes: 1, items: n.items.length });

  // Fetched from the public lookup URL, which needs the "|3|1" suffix --
  // the chave alone returns an empty page.
  assert.equal(calls.length, 1);
  assert.equal(calls[0], `https://www.fazenda.pr.gov.br/nfce/qrcode?p=${n.chave}%7C3%7C1`);

  const stored = getNote(db, n.chave)!;
  assert.equal(stored.source_url, calls[0], "source_url records what was actually fetched");
});

test("POST /api/nfce rejects an unsupported UF given as a chave, without fetching", async (t) => {
  const db = freshDb(t);
  const calls = stubFetch(t, NOT_A_NOTE);
  const app = createApp(db);

  const res = await postJson(app, { chave: "35" + SYNTHETIC_CHAVE.slice(2) });
  assert.equal(res.status, 422);
  assert.deepEqual(calls, [], "routing happens before the network");
  assert.deepEqual(counts(db), { notes: 0, items: 0 });
});

test("POST /api/nfce rejects malformed chaves", async (t) => {
  const db = freshDb(t);
  const app = createApp(db);

  assert.equal((await postJson(app, { chave: "4126 0906" })).status, 400, "too short");
  assert.equal((await postJson(app, { chave: `${SYNTHETIC_CHAVE}7` })).status, 400, "too long");
  // A URL in the chave field must not be salvaged by stripping its non-digits.
  assert.equal(
    (await postJson(app, { chave: qrUrl(SYNTHETIC_CHAVE) })).status,
    400,
    "a URL is not a chave",
  );
  assert.equal((await postJson(app, { chave: "" })).status, 400, "empty");
  assert.deepEqual(counts(db), { notes: 0, items: 0 });
});

test("a chave and its QR URL land on the same stored note", { skip: skipWithoutFixture }, async (t) => {
  const db = freshDb(t);
  stubFetch(t, html());
  const app = createApp(db);
  const n = note();

  assert.equal((await postJson(app, { url: qrUrl(n.chave) })).status, 200);
  assert.equal((await postJson(app, { chave: n.chave })).status, 200);
  assert.deepEqual(counts(db), { notes: 1, items: n.items.length }, "still one note");
});
