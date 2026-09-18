import assert from "node:assert/strict";
import { test } from "node:test";
import { brl, chaveShort, dateTime, hostLabel, plural } from "../src/format.ts";
import { en, pt } from "../src/i18n/strings.ts";
import { CHAVE } from "./fixture.ts";

test("brl formats integer cents the way the receipt prints them", () => {
  assert.equal(brl(84457), "R$ 844,57");
  assert.equal(brl(5), "R$ 0,05");
  assert.equal(brl(0), "R$ 0,00");
  assert.equal(brl(123456789), "R$ 1.234.567,89");
  assert.equal(brl(-250), "-R$ 2,50");
});

test("brl leaves absent values absent", () => {
  assert.equal(brl(null), null);
  assert.equal(brl(undefined), null);
  assert.equal(brl(Number.NaN), null);
});

test("dateTime renders stored local timestamps in pt", () => {
  assert.equal(dateTime("2026-09-02T19:12:34", pt), "02/09/2026 19:12");
  assert.equal(dateTime("2026-09-02 19:12:34", pt), "02/09/2026 19:12");
  assert.equal(dateTime("2026-09-02", pt), "02/09/2026");
  assert.equal(dateTime(null, pt), null);
});

test("dateTime names the month in en, so a date is never read as another day", () => {
  assert.equal(dateTime("2026-09-02T19:12:34", en), "2 Sep 2026 19:12");
  assert.equal(dateTime("2026-09-02", en), "2 Sep 2026");
  assert.equal(dateTime("2026-01-31", en), "31 Jan 2026");
  assert.equal(dateTime("2026-12-25", en), "25 Dec 2026");
});

test("dateTime passes through anything it cannot read", () => {
  assert.equal(dateTime("ontem", pt), "ontem");
  assert.equal(dateTime("ontem", en), "ontem");
});

test("chaveShort keeps both ends of the 44 digits", () => {
  assert.equal(chaveShort(CHAVE), "41260906…000017");
  assert.equal(chaveShort("123"), "123");
});

test("plural picks the pt-BR noun", () => {
  assert.equal(plural(1, "nota", "notas"), "1 nota");
  assert.equal(plural(0, "nota", "notas"), "0 notas");
  assert.equal(plural(12, "item", "itens"), "12 itens");
});

test("hostLabel drops the scheme and nothing else", () => {
  assert.equal(hostLabel("http://192.168.1.10:3000"), "192.168.1.10:3000");
  assert.equal(hostLabel("https://nf.example.com/tracker"), "nf.example.com/tracker");
});
