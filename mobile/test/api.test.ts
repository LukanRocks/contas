import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, normalizeBaseUrl } from "../src/api.ts";

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
