import assert from "node:assert/strict";
import { test } from "node:test";
import { PALETTES } from "../src/theme/palette.ts";
import { isThemeSetting, resolveScheme } from "../src/theme/scheme.ts";

test("a palette the user picked wins over the device", () => {
  assert.equal(resolveScheme("dark", "light"), "dark");
  assert.equal(resolveScheme("light", "dark"), "light");
});

test("system follows the device", () => {
  assert.equal(resolveScheme("system", "dark"), "dark");
  assert.equal(resolveScheme("system", "light"), "light");
});

test("a device with no preference reads as light", () => {
  // Android reports "unspecified" when the user has not chosen; iOS and the
  // web can answer null before the first query resolves.
  assert.equal(resolveScheme("system", "unspecified"), "light");
  assert.equal(resolveScheme("system", null), "light");
  assert.equal(resolveScheme("system", undefined), "light");
});

test("only the three stored values are accepted back from the device", () => {
  for (const valid of ["system", "light", "dark"]) assert.ok(isThemeSetting(valid));
  for (const invalid of ["sepia", "", null, undefined, 0, "Dark"]) {
    assert.equal(isThemeSetting(invalid), false);
  }
});

test("the two palettes agree on what they carry, and on which is dark", () => {
  assert.deepEqual(Object.keys(PALETTES.light).sort(), Object.keys(PALETTES.dark).sort());
  assert.equal(PALETTES.light.dark, false);
  assert.equal(PALETTES.dark.dark, true);
});
