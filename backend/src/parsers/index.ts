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

/** Route to the state parser for `uf`. */
export function parse(html: string, uf: string): ParsedNote {
  const impl = PARSERS[uf];
  if (!impl) throw new UnsupportedUfError(uf);
  return impl(html);
}
