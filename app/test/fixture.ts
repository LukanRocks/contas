/**
 * A made-up chave de acesso: 44 digits opening with 41, so it routes like a
 * Paraná note. No real note appears anywhere in this repo -- a scanned NFC-e
 * carries the buyer's CPF (see backend/test/fixture.ts).
 */
export const CHAVE = "41260906057200000000650010000000011000000017";

/** The URL that note's QR code would encode: the chave, then versão and ambiente. */
export const QR_URL = `https://www.fazenda.pr.gov.br/nfce/qrcode?p=${CHAVE}%7C3%7C1`;
