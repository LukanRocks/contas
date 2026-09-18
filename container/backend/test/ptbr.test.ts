import test from "node:test";
import assert from "node:assert/strict";
import { brDateTimeToIso, digitsOnly, parseDecimal, toCents } from "../src/ptbr.ts";

test("converts pt-BR money to integer cents", () => {
  assert.equal(toCents("3,79"), 379);
  assert.equal(toCents("844,57"), 84457);
  assert.equal(toCents("0,95"), 95);
  assert.equal(toCents("64,02"), 6402);
});

test("handles unit prices that are not two decimals", () => {
  assert.equal(toCents("54,5"), 5450);
  assert.equal(toCents("13,9"), 1390);
  assert.equal(toCents("7"), 700);
});

test("handles the thousands separator", () => {
  assert.equal(toCents("1.234,56"), 123456);
  assert.equal(toCents("R$ 1.234,56"), 123456);
});

test("rounds half-up beyond two decimals without float drift", () => {
  assert.equal(toCents("3,795"), 380);
  assert.equal(toCents("3,794"), 379);
  // 0.29 * 100 is 28.999... in binary floating point; string parsing avoids it.
  assert.equal(toCents("0,29"), 29);
  assert.equal(toCents("1,005"), 101);
});

test("parses fractional quantities", () => {
  assert.equal(parseDecimal("0,412"), 0.412);
  assert.equal(parseDecimal("0,15"), 0.15);
  assert.equal(parseDecimal("48"), 48);
});

test("rejects non-numeric input", () => {
  assert.throws(() => toCents("abc"));
  assert.throws(() => parseDecimal(""));
});

test("canonicalises documents to digits", () => {
  assert.equal(digitsOnly("12.345.678/0001-99"), "12345678000199");
  assert.equal(digitsOnly("111.444.777-35"), "11144477735");
});

test("converts pt-BR datetimes to ISO 8601", () => {
  assert.equal(brDateTimeToIso("02/09/2026 19:12:34"), "2026-09-02T19:12:34");
  assert.equal(brDateTimeToIso("02/09/2026"), "2026-09-02");
  assert.equal(brDateTimeToIso("nope"), null);
});
