import assert from "node:assert/strict";
import { test } from "node:test";
import { en, pt } from "../src/i18n/strings.ts";
import { isStartTab, START_TABS, startTabLabel } from "../src/startTab.ts";

test("the notes are the default, and the camera the alternative", () => {
  assert.deepEqual(START_TABS, ["Home", "Scan"]);
});

test("only the two stored tabs are accepted back from the device", () => {
  for (const valid of ["Home", "Scan"]) assert.ok(isStartTab(valid));
  // Settings is a tab, but not one the app opens on.
  for (const invalid of ["Settings", "home", "scan", "", null, undefined, 1]) {
    assert.equal(isStartTab(invalid), false);
  }
});

test("each choice reads as the tab it opens", () => {
  for (const t of [pt, en]) {
    assert.equal(startTabLabel("Home", t), t.tabs.home);
    assert.equal(startTabLabel("Scan", t), t.tabs.scan);
  }
});
