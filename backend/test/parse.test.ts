import test from "node:test";
import assert from "node:assert/strict";
import { crossCheckAgainstChave } from "../src/crosscheck.ts";
import { parse, UnsupportedUfError } from "../src/parsers/index.ts";
import { ParseError, parsePR } from "../src/parsers/pr.ts";
import type { ParsedNote } from "../src/types.ts";
import { html, skipWithoutFixture } from "./fixture.ts";

/**
 * These assert invariants that hold for any PR note rather than the values of
 * one particular receipt, so they work against whatever page you captured.
 */
let cached: ParsedNote | null = null;
const note = (): ParsedNote => (cached ??= parsePR(html()));

/* ---------- always run: no note required ---------- */

test("the UF router rejects states without a parser", () => {
  assert.throws(() => parse("", "35"), UnsupportedUfError);
  assert.throws(() => parse("", "99"), UnsupportedUfError);
});

test("a page that is not a note is rejected rather than half-parsed", () => {
  assert.throws(() => parsePR("<html><body>Nota nao encontrada</body></html>"), ParseError);
  assert.throws(() => parsePR(""), ParseError);
});

/* ---------- require NFCE_FIXTURE ---------- */

test("parses the note header", { skip: skipWithoutFixture }, () => {
  const n = note();
  assert.match(n.chave, /^\d{44}$/, "chave is 44 digits");
  assert.equal(n.uf, "41");
  assert.match(n.emit_cnpj ?? "", /^\d{14}$/, "emitente CNPJ is digits only");
  assert.ok((n.emit_name ?? "").length > 0, "emitente name is present");
  assert.ok((n.emit_address ?? "").length > 0, "emitente address is present");
  assert.match(n.emitted_at ?? "", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, "emitted_at is ISO");
  assert.match(n.numero ?? "", /^\d+$/);
  assert.match(n.serie ?? "", /^\d+$/);
});

test("the scrape agrees with the chave", { skip: skipWithoutFixture }, () => {
  // Cross-checks CNPJ, número, série and the item count against the key itself.
  assert.deepEqual(crossCheckAgainstChave(note()), []);
});

test("items are numbered in print order", { skip: skipWithoutFixture }, () => {
  const items = note().items;
  assert.ok(items.length > 0, "a note has at least one line");
  assert.deepEqual(
    items.map((i) => i.n_item),
    items.map((_, idx) => idx + 1),
  );
});

test("every item is well formed", { skip: skipWithoutFixture }, () => {
  for (const item of note().items) {
    const where = `item ${item.n_item} (${item.description})`;
    assert.ok(item.description.length > 0, `${where}: has a description`);
    assert.ok(item.qty > 0, `${where}: positive quantity`);
    assert.ok(Number.isInteger(item.unit_value_c), `${where}: unit price is integer cents`);
    assert.ok(Number.isInteger(item.total_value_c), `${where}: line total is integer cents`);
    assert.ok(item.unit_value_c >= 0 && item.total_value_c >= 0, `${where}: non-negative`);
  }
});

test("repeated products stay on separate lines", { skip: skipWithoutFixture }, () => {
  // Keyed by n_item, never deduped -- the same product legitimately repeats.
  const items = note().items;
  assert.equal(new Set(items.map((i) => i.n_item)).size, items.length);
});

test("item totals reconcile with the note total", { skip: skipWithoutFixture }, () => {
  const n = note();
  const sum = n.items.reduce((acc, i) => acc + i.total_value_c, 0);
  assert.equal(sum, n.total_value_c, "sum of line totals equals Valor total");
  if (n.payable_c !== null && n.total_value_c !== null) {
    assert.equal(n.total_value_c - (n.discount_c ?? 0), n.payable_c, "total - discount = payable");
  }
});

test("money is stored as integer cents", { skip: skipWithoutFixture }, () => {
  const n = note();
  for (const field of ["total_value_c", "discount_c", "payable_c", "paid_c", "taxes_c"] as const) {
    const value = n[field];
    assert.ok(value === null || Number.isInteger(value), `${field} is integer cents or null`);
  }
  assert.ok(n.total_items === null || Number.isInteger(n.total_items));
});

test("consumer CPF is digits only when present", { skip: skipWithoutFixture }, () => {
  const cpf = note().consumer_cpf;
  assert.ok(cpf === null || /^\d{11}$/.test(cpf), "CPF is null or 11 digits");
});

test("the UF router dispatches 41 to the PR parser", { skip: skipWithoutFixture }, () => {
  assert.deepEqual(parse(html(), "41"), note());
});
