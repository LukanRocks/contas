import type { Strings } from "./i18n";

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

/**
 * "2026-09-02T19:12:34" -> "02/09/2026 19:12" in pt, "2 Sep 2026 19:12" in en
 * (the stored value is already local time). Putting the parts in order is the
 * language's job: all-digit dates mean different days in different places.
 */
export function dateTime(iso: string | null | undefined, t: Strings): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(iso);
  if (!m || !m[1] || !m[2] || !m[3]) return iso;
  const [, year, month, day, hh, mi] = m;
  return t.formatDateTime({ year, month, day, time: hh && mi ? `${hh}:${mi}` : null });
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "http://192.168.1.10:3000" -> "192.168.1.10:3000" — short enough for a header line. */
export function hostLabel(baseUrl: string): string {
  return baseUrl.replace(/^https?:\/\//, "");
}
