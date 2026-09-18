import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, getNote, noteHtmlUrl, normalizeBaseUrl } from "../src/api.ts";
import { pt } from "../src/i18n/strings.ts";
import { CHAVE } from "./fixture.ts";

test("a bare host on the local network gets http", () => {
  assert.equal(normalizeBaseUrl("192.168.1.10:3000"), "http://192.168.1.10:3000");
  assert.equal(normalizeBaseUrl("localhost:3000"), "http://localhost:3000");
  assert.equal(normalizeBaseUrl("nf.local"), "http://nf.local");
});

test("a public name gets https", () => {
  assert.equal(normalizeBaseUrl("nf.example.com"), "https://nf.example.com");
});

test("an explicit scheme is kept as typed", () => {
  assert.equal(normalizeBaseUrl("http://nf.example.com"), "http://nf.example.com");
  assert.equal(normalizeBaseUrl("https://192.168.1.10:3000"), "https://192.168.1.10:3000");
});

test("trailing slashes and a pasted /api are trimmed", () => {
  assert.equal(normalizeBaseUrl("https://nf.example.com/"), "https://nf.example.com");
  assert.equal(normalizeBaseUrl("https://nf.example.com/api"), "https://nf.example.com");
  assert.equal(normalizeBaseUrl("https://nf.example.com/api/"), "https://nf.example.com");
});

test("a sub-path the server is mounted under survives", () => {
  assert.equal(normalizeBaseUrl("https://casa.example.com/nf/api"), "https://casa.example.com/nf");
});

test("surrounding whitespace is forgiven", () => {
  assert.equal(normalizeBaseUrl("  192.168.1.10:3000  "), "http://192.168.1.10:3000");
});

test("empty and unusable input is rejected with a readable message", () => {
  assert.throws(() => normalizeBaseUrl("   "), ApiError);
  assert.throws(() => normalizeBaseUrl("ftp://nf.example.com"), ApiError);
  assert.throws(() => normalizeBaseUrl("http://"), ApiError);
});

/** Answers every request with `body` and `status`, for the length of one test. */
function stubFetch(t: { after: (fn: () => void) => void }, status: number, body: unknown) {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  t.after(() => {
    globalThis.fetch = original;
  });
}

test("getNote returns the note the server sends", async (t) => {
  stubFetch(t, 200, { chave: CHAVE, uf: "41", items: [] });
  const note = await getNote("http://nf.local", CHAVE);
  assert.equal(note.chave, CHAVE);
});

test("getNote says a missing note is missing, not that the server failed", async (t) => {
  stubFetch(t, 404, { error: "not_found", chave: CHAVE });
  await assert.rejects(getNote("http://nf.local", CHAVE), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.describe(pt), pt.errors.noteNotFound);
    return true;
  });
});

test("getNote rejects an answer that is not a note", async (t) => {
  stubFetch(t, 200, { status: "ok" });
  await assert.rejects(getNote("http://nf.local", CHAVE), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.describe(pt), pt.errors.noteMissing);
    return true;
  });
});

test("noteHtmlUrl points at the stored page", () => {
  assert.equal(noteHtmlUrl("http://nf.local", CHAVE), `http://nf.local/api/nfce/${CHAVE}/html`);
});
