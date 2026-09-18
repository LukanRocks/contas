import assert from "node:assert/strict";
import { test } from "node:test";
import { isLanguageSetting, resolveLanguage } from "../src/i18n/language.ts";
import { BUNDLES, en, pt } from "../src/i18n/strings.ts";

test("a language the user picked wins over the device", () => {
  assert.equal(resolveLanguage("pt", ["en-US"]), "pt");
  assert.equal(resolveLanguage("en", ["pt-BR"]), "en");
});

test("system follows the device's first language the app speaks", () => {
  assert.equal(resolveLanguage("system", ["pt-BR", "en-US"]), "pt");
  assert.equal(resolveLanguage("system", ["en-US", "pt-BR"]), "en");
  assert.equal(resolveLanguage("system", ["en"]), "en");
});

test("region and case do not matter, only the language subtag", () => {
  assert.equal(resolveLanguage("system", ["pt-PT"]), "pt");
  assert.equal(resolveLanguage("system", ["PT_br"]), "pt");
  assert.equal(resolveLanguage("system", ["EN-GB"]), "en");
});

test("a device the app cannot read falls back to English", () => {
  assert.equal(resolveLanguage("system", ["fr-FR", "de-DE"]), "en");
  assert.equal(resolveLanguage("system", []), "en");
});

test("a device that speaks something else first still gets a language it asked for", () => {
  assert.equal(resolveLanguage("system", ["ja-JP", "pt-BR"]), "pt");
});

test("only the three stored values are accepted back from the device", () => {
  for (const valid of ["system", "pt", "en"]) assert.ok(isLanguageSetting(valid));
  for (const invalid of ["es", "", null, undefined, 42, "PT"]) {
    assert.equal(isLanguageSetting(invalid), false);
  }
});

test("both bundles carry the same keys", () => {
  // The type already enforces this at build time; this catches a bundle that
  // stopped being reachable through BUNDLES.
  assert.deepEqual(Object.keys(BUNDLES).sort(), ["en", "pt"]);
  assert.deepEqual(Object.keys(en).sort(), Object.keys(pt).sort());
  assert.deepEqual(Object.keys(en.errors).sort(), Object.keys(pt.errors).sort());
  assert.deepEqual(Object.keys(en.scan).sort(), Object.keys(pt.scan).sort());
});
