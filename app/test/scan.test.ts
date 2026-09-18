import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyScan } from "../src/scan.ts";
import { CHAVE, QR_URL } from "./fixture.ts";

test("a note's QR URL is sent as a URL, verbatim", () => {
  assert.deepEqual(classifyScan(QR_URL), { url: QR_URL });
  assert.deepEqual(classifyScan(`  ${QR_URL}  `), { url: QR_URL });
});

test("any http(s) code is left for the backend to judge", () => {
  // The rules for pulling a chave out of a URL live on the server; rejecting
  // here would mean turning down notes it would have accepted.
  assert.deepEqual(classifyScan("http://nfce.sefaz.example/consulta?p=x"), {
    url: "http://nfce.sefaz.example/consulta?p=x",
  });
});

test("a bare chave is sent as a chave, digits only", () => {
  assert.deepEqual(classifyScan(CHAVE), { chave: CHAVE });
  assert.deepEqual(classifyScan("4126 0906 0572 0000 0000 6500 1000 0000 0110 0000 0017"), {
    chave: CHAVE,
  });
});

test("a QR code that is not a note is turned down without a round trip", () => {
  assert.equal(classifyScan("WIFI:S:casa;T:WPA;P:segredo;;"), null);
  assert.equal(classifyScan("BEGIN:VCARD\nFN:Fulano\nEND:VCARD"), null);
  assert.equal(classifyScan(""), null);
  assert.equal(classifyScan("   "), null);
});

test("digits that are not 44 long are not a chave", () => {
  assert.equal(classifyScan("12345"), null);
  assert.equal(classifyScan(`${CHAVE}9`), null);
});

test("text with a chave buried in it is not a chave", () => {
  assert.equal(classifyScan(`nota ${CHAVE}`), null);
});
