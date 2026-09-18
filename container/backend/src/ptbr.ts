/**
 * pt-BR numeric parsing.
 *
 * On the fiscal portals the decimal separator is a comma and the thousands
 * separator is a dot ("1.234,56"). Money is converted straight from the decimal
 * *string* to integer cents so no binary float ever holds the value -- that
 * keeps `54,5` at exactly 5450 rather than 5449.999...
 */

/** Collapse whitespace (incl. NBSP) and trim. */
export function normalizeText(raw: string): string {
  return raw.replace(/[\s\u00a0]+/g, " ").trim();
}

/** "R$ 1.234,56" -> "1234.56". Drops thousands dots, comma becomes the point. */
export function toDecimalString(raw: string): string {
  const cleaned = normalizeText(raw).replace(/[^\d.,-]/g, "");
  return cleaned.replace(/\./g, "").replace(",", ".");
}

/** Parse a pt-BR decimal ("0,412") into a number. Used for quantities. */
export function parseDecimal(raw: string): number {
  const s = toDecimalString(raw);
  const n = Number(s);
  if (s === "" || !Number.isFinite(n)) {
    throw new Error(`not a pt-BR number: ${JSON.stringify(raw)}`);
  }
  return n;
}

/** Parse a pt-BR integer ("40"). */
export function parseInteger(raw: string): number {
  const n = parseDecimal(raw);
  if (!Number.isInteger(n)) throw new Error(`not an integer: ${JSON.stringify(raw)}`);
  return n;
}

/**
 * Parse pt-BR money into integer cents, half-up on the third decimal.
 * Purely string arithmetic -- no float multiplication, so no drift.
 */
export function toCents(raw: string): number {
  const s = toDecimalString(raw);
  const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) {
    throw new Error(`not a pt-BR money value: ${JSON.stringify(raw)}`);
  }
  const sign = m[1] === "-" ? -1 : 1;
  const intPart = m[2] === "" ? "0" : m[2]!;
  const frac = m[3] ?? "";
  // Keep three fractional digits: two for the value, one to round on.
  const padded = (frac + "000").slice(0, 3);
  let cents = Number(intPart) * 100 + Number(padded.slice(0, 2));
  if (Number(padded[2]) >= 5) cents += 1;
  return sign * cents;
}

/** Keep only digits -- canonical form for CNPJ, CPF and the chave. */
export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** "02/09/2026 19:12:34" -> "2026-09-02T19:12:34" (naive local, America/Sao_Paulo). */
export function brDateTimeToIso(raw: string): string | null {
  const m = /(\d{2})\/(\d{2})\/(\d{4})(?:[\s,]+(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(raw);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, mi, ss] = m;
  if (hh === undefined) return `${yyyy}-${mm}-${dd}`;
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss ?? "00"}`;
}
