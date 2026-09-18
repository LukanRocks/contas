/**
 * Money arrives as integer cents and dates as the strings the parser stored.
 * Both are formatted by hand rather than through `toLocaleString("pt-BR")`:
 * Hermes ships a trimmed ICU on Android, so locale-aware formatting is not
 * dependable across the two platforms this app targets.
 */

/** 84457 -> "R$ 844,57" */
export function brl(cents: number | null | undefined): string | null {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return null;
  const digits = Math.round(Math.abs(cents)).toString().padStart(3, "0");
  const reais = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${cents < 0 ? "-" : ""}R$ ${reais},${digits.slice(-2)}`;
}

/** "2026-09-02T19:12:34" -> "02/09/2026 19:12" (already local time). */
export function dateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d, hh, mi] = m;
  return hh ? `${d}/${mo}/${y} ${hh}:${mi}` : `${d}/${mo}/${y}`;
}

/** A chave is 44 digits — far too wide for a phone, so show both ends. */
export function chaveShort(chave: string): string {
  return chave.length <= 16 ? chave : `${chave.slice(0, 8)}…${chave.slice(-6)}`;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
