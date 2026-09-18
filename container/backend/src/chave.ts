import { digitsOnly } from "./ptbr.ts";

/** Fields encoded in the 44-digit chave de acesso (1-based positions in comments). */
export type DecodedChave = {
  cUF: string;        // 1-2
  aamm: string;       // 3-6
  cnpj: string;       // 7-20
  mod: string;        // 21-22
  serie: string;      // 23-25, zero-padded as printed
  numero: string;     // 26-34, zero-padded as printed
  tpEmis: string;     // 35
  cNF: string;        // 36-43
  dv: string;         // 44
  /** Leading zeros stripped, for comparison against the scraped page. */
  serieNormalized: string;
  numeroNormalized: string;
};

export class InvalidChaveError extends Error {}

/** Strip whitespace/formatting and require exactly 44 digits. */
export function normalizeChave(raw: string): string {
  const chave = digitsOnly(raw);
  if (!/^\d{44}$/.test(chave)) {
    throw new InvalidChaveError(
      `chave de acesso must be 44 digits, got ${chave.length}: ${JSON.stringify(raw)}`,
    );
  }
  return chave;
}

/**
 * Pull the chave out of a scanned QR URL.
 * The `p` param is `chave|versao|tpAmb|...`; the chave is element [0].
 * URL decoding turns %7C back into "|" before the split.
 */
export function extractChaveFromUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new InvalidChaveError(`not a valid URL: ${JSON.stringify(url)}`);
  }
  const p = parsed.searchParams.get("p");
  if (!p) throw new InvalidChaveError(`URL has no "p" query parameter: ${url}`);
  const first = p.split("|")[0] ?? "";
  return normalizeChave(first);
}

/** Strip leading zeros but keep a lone "0". */
function stripLeadingZeros(s: string): string {
  return s.replace(/^0+(?=\d)/, "");
}

export function decodeChave(raw: string): DecodedChave {
  const c = normalizeChave(raw);
  const serie = c.slice(22, 25);
  const numero = c.slice(25, 34);
  return {
    cUF: c.slice(0, 2),
    aamm: c.slice(2, 6),
    cnpj: c.slice(6, 20),
    mod: c.slice(20, 22),
    serie,
    numero,
    tpEmis: c.slice(34, 35),
    cNF: c.slice(35, 43),
    dv: c.slice(43, 44),
    serieNormalized: stripLeadingZeros(serie),
    numeroNormalized: stripLeadingZeros(numero),
  };
}

/** UF code used to route to a state parser. */
export function ufFromChave(raw: string): string {
  return normalizeChave(raw).slice(0, 2);
}

/** Mod-11 check digit over the first 43 digits (weights 2..9, right to left). */
export function computeChaveDv(raw: string): number {
  const c = digitsOnly(raw).slice(0, 43);
  if (c.length !== 43) throw new InvalidChaveError("need 43 digits to compute DV");
  let sum = 0;
  let weight = 2;
  for (let i = c.length - 1; i >= 0; i--) {
    sum += Number(c[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const dv = 11 - (sum % 11);
  return dv >= 10 ? 0 : dv;
}

export function isValidChaveDv(raw: string): boolean {
  const c = normalizeChave(raw);
  return computeChaveDv(c) === Number(c[43]);
}
