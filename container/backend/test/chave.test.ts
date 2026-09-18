import test from "node:test";
import assert from "node:assert/strict";
import {
  computeChaveDv,
  decodeChave,
  extractChaveFromUrl,
  InvalidChaveError,
  isValidChaveDv,
  normalizeChave,
  ufFromChave,
} from "../src/chave.ts";

// Structurally valid but entirely made up -- no real note in the repo.
const CHAVE = "41260112345678000199650010000001231123456782";
const URL_SAMPLE = `https://www.fazenda.pr.gov.br/nfce/qrcode?p=${CHAVE}%7C3%7C1`;

test("extracts the chave from a scanned QR URL", () => {
  assert.equal(extractChaveFromUrl(URL_SAMPLE), CHAVE);
});

test("extracts the chave when the pipes are not percent-encoded", () => {
  assert.equal(extractChaveFromUrl(`https://www.fazenda.pr.gov.br/nfce/qrcode?p=${CHAVE}|3|1`), CHAVE);
});

test("rejects URLs without a usable chave", () => {
  assert.throws(() => extractChaveFromUrl("https://www.fazenda.pr.gov.br/nfce/qrcode"), InvalidChaveError);
  assert.throws(() => extractChaveFromUrl("https://example.com/?p=123|3|1"), InvalidChaveError);
  assert.throws(() => extractChaveFromUrl("not a url"), InvalidChaveError);
});

test("strips whitespace from a chave printed in groups of four", () => {
  const grouped = CHAVE.replace(/(\d{4})(?=\d)/g, "$1 ");
  assert.notEqual(grouped, CHAVE);
  assert.equal(normalizeChave(grouped), CHAVE);
});

test("decodes every field of the chave", () => {
  assert.deepEqual(decodeChave(CHAVE), {
    cUF: "41",
    aamm: "2601",
    cnpj: "12345678000199",
    mod: "65",
    serie: "001",
    numero: "000000123",
    tpEmis: "1",
    cNF: "12345678",
    dv: "2",
    serieNormalized: "1",
    numeroNormalized: "123",
  });
});

test("routes by UF", () => {
  assert.equal(ufFromChave(CHAVE), "41");
});

test("validates the mod-11 check digit", () => {
  assert.equal(computeChaveDv(CHAVE), 2);
  assert.ok(isValidChaveDv(CHAVE));
  // Corrupt a digit in the middle: the DV must no longer agree.
  const corrupted = CHAVE.slice(0, 20) + (CHAVE[20] === "6" ? "7" : "6") + CHAVE.slice(21);
  assert.ok(!isValidChaveDv(corrupted));
});
