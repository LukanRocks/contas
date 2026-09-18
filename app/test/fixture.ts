/**
 * NOT A REAL FISCAL NOTE, and not a leaked key: these 44 digits are invented.
 * The mod-11 check digit in the last position does not validate (the digits
 * compute to 8, the value ends in 7), so no note with this chave can exist --
 * `backend/src/chave.ts` would reject it as malformed.
 *
 * It opens with 41 so the code under test routes it like a Paraná note, which
 * is all any test here needs. A genuine chave never appears in this repo: a
 * scanned NFC-e identifies the person who bought the groceries and carries
 * their CPF. See backend/test/fixture.ts, which keeps real captures out of git
 * for the same reason.
 */
export const CHAVE = "41260906057200000000650010000000011000000017";

/** The URL that note's QR code would encode: the chave, then versão and ambiente. */
export const QR_URL = `https://www.fazenda.pr.gov.br/nfce/qrcode?p=${CHAVE}%7C3%7C1`;
