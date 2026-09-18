import assert from "node:assert/strict";
import { test } from "node:test";
import {
  brl,
  chaveGroups,
  cnpj,
  cpf,
  dateTime,
  fileSize,
  hostLabel,
  instant,
  plural,
  quantity,
} from "../src/format.ts";
import { en, pt } from "../src/i18n/strings.ts";

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

test("dateTime keeps the seconds only when asked, and only when stored", () => {
  assert.equal(dateTime("2026-09-02T19:12:34", pt, { seconds: true }), "02/09/2026 19:12:34");
  assert.equal(dateTime("2026-09-02T19:12", pt, { seconds: true }), "02/09/2026 19:12");
  assert.equal(dateTime("2026-09-02T19:12:34", en, { seconds: true }), "2 Sep 2026 19:12:34");
});

test("dateTime passes through anything it cannot read", () => {
  assert.equal(dateTime("ontem", pt), "ontem");
  assert.equal(dateTime("ontem", en), "ontem");
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

test("quantity reads like the receipt: comma decimals, trailing zeros dropped", () => {
  assert.equal(quantity(2), "2");
  assert.equal(quantity(1.5), "1,5");
  assert.equal(quantity(0.352), "0,352");
  assert.equal(quantity(0.1 + 0.2), "0,3");
  assert.equal(quantity(1234.5), "1.234,5");
  assert.equal(quantity(null), null);
});

test("instant moves a UTC timestamp to the device's time zone", () => {
  // Built from local parts, so the expectation holds in whatever zone the test runs.
  const iso = new Date(2026, 8, 2, 19, 12, 34).toISOString();
  assert.equal(instant(iso, pt), "02/09/2026 19:12");
  assert.equal(instant(iso, en), "2 Sep 2026 19:12");
  assert.equal(instant("not a date", pt), "not a date");
  assert.equal(instant(null, pt), null);
});

test("cnpj and cpf are punctuated, and anything else is left as stored", () => {
  assert.equal(cnpj("06057200000000"), "06.057.200/0000-00");
  assert.equal(cnpj("0605720000"), "0605720000");
  assert.equal(cpf("12345678909"), "123.456.789-09");
  assert.equal(cpf("***.456.789-**"), "***.456.789-**");
  assert.equal(cnpj(null), null);
  assert.equal(cpf(null), null);
});

test("chaveGroups prints the chave in fours", () => {
  assert.equal(chaveGroups("41260906057200000000650010000000011000000017").split(" ").length, 11);
  assert.equal(chaveGroups("123456789"), "1234 5678 9");
});

test("fileSize rounds to whole units", () => {
  assert.equal(fileSize(512), "512 B");
  assert.equal(fileSize(48213), "47 KB");
  assert.equal(fileSize(null), null);
});
