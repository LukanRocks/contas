import { decodeChave } from "./chave.ts";
import type { ParsedNote } from "./types.ts";

/**
 * The chave encodes the emitente CNPJ, série and número, so it doubles as a
 * checksum on the scrape. A mismatch is a cheap early signal that the portal's
 * page layout changed under us.
 */
export function crossCheckAgainstChave(note: ParsedNote): string[] {
  const decoded = decodeChave(note.chave);
  const warnings: string[] = [];

  if (note.emit_cnpj !== null && note.emit_cnpj !== decoded.cnpj) {
    warnings.push(`emit_cnpj: page has ${note.emit_cnpj}, chave encodes ${decoded.cnpj}`);
  }
  if (note.numero !== null && note.numero.replace(/^0+(?=\d)/, "") !== decoded.numeroNormalized) {
    warnings.push(`numero: page has ${note.numero}, chave encodes ${decoded.numeroNormalized}`);
  }
  if (note.serie !== null && note.serie.replace(/^0+(?=\d)/, "") !== decoded.serieNormalized) {
    warnings.push(`serie: page has ${note.serie}, chave encodes ${decoded.serieNormalized}`);
  }
  if (note.total_items !== null && note.total_items !== note.items.length) {
    warnings.push(`total_items: note reports ${note.total_items}, parsed ${note.items.length} rows`);
  }

  return warnings;
}
