import type { ParsedNote } from "../types.ts";
import { parsePR } from "./pr.ts";

export { ParseError } from "./pr.ts";

export class UnsupportedUfError extends Error {
  readonly uf: string;
  constructor(uf: string) {
    super(`unsupported UF "${uf}": only Paraná (41) is supported`);
    this.uf = uf;
    this.name = "UnsupportedUfError";
  }
}

/** UF codes with a parser implementation. MVP ships Paraná only. */
const PARSERS: Record<string, (html: string) => ParsedNote> = {
  "41": parsePR,
};

export function isSupportedUf(uf: string): boolean {
  return uf in PARSERS;
}

/**
 * Public lookup URL for a chave, used when a note is ingested by key rather
 * than by scanning its QR code -- notes pulled from the Nota Paraná account
 * sit behind a login, but the same note is readable anonymously here.
 *
 * The "|3|1" suffix is version 3, production environment. It carries no
 * signed or note-specific data; the chave alone returns an empty page.
 */
const CONSULTA_URLS: Record<string, (chave: string) => string> = {
  "41": (chave) =>
    `https://www.fazenda.pr.gov.br/nfce/qrcode?p=${encodeURIComponent(`${chave}|3|1`)}`,
};

export function consultaUrl(uf: string, chave: string): string {
  const build = CONSULTA_URLS[uf];
  if (!build) throw new UnsupportedUfError(uf);
  return build(chave);
}

/** Route to the state parser for `uf`. */
export function parse(html: string, uf: string): ParsedNote {
  const impl = PARSERS[uf];
  if (!impl) throw new UnsupportedUfError(uf);
  return impl(html);
}
