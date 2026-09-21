import assert from "node:assert/strict";
import { test } from "node:test";
import { en, pt } from "../src/i18n/strings.ts";
import { isStartTab, START_TABS, startTabLabel } from "../src/startTab.ts";

test("home is the default, with the notes and the camera as alternatives", () => {
  assert.deepEqual(START_TABS, ["Home", "Notes", "Scan"]);
});

test("only the three stored tabs are accepted back from the device", () => {
  for (const valid of ["Home", "Notes", "Scan"]) assert.ok(isStartTab(valid));
  // Settings is a tab, but not one the app opens on.
  for (const invalid of ["Settings", "home", "notes", "scan", "", null, undefined, 1]) {
    assert.equal(isStartTab(invalid), false);
  }
});

test("each choice reads as the tab it opens", () => {
  for (const t of [pt, en]) {
    assert.equal(startTabLabel("Home", t), t.tabs.home);
    assert.equal(startTabLabel("Notes", t), t.tabs.notes);
    assert.equal(startTabLabel("Scan", t), t.tabs.scan);
  }
});
