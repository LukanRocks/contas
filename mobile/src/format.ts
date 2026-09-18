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
 * 1.5 -> "1,5", 0.352 -> "0,352", 2 -> "2". A quantity sits on the same line
 * as the money it multiplies, so it is written the way the receipt writes it,
 * in either language -- up to the three decimals a weighed item carries.
 */
export function quantity(n: number | null | undefined): string | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const [int = "0", frac = ""] = Math.abs(n).toFixed(3).split(".");
  const decimals = frac.replace(/0+$/, "");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 ? "-" : ""}${grouped}${decimals ? `,${decimals}` : ""}`;
}

/**
 * "2026-09-02T19:12:34" -> "02/09/2026 19:12" in pt, "2 Sep 2026 19:12" in en
 * (the stored value is already local time). Putting the parts in order is the
 * language's job: all-digit dates mean different days in different places.
 */
export function dateTime(
  iso: string | null | undefined,
  t: Strings,
  { seconds = false }: { seconds?: boolean } = {},
): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(iso);
  if (!m || !m[1] || !m[2] || !m[3]) return iso;
  const [, year, month, day, hh, mi, ss] = m;
  const time = hh && mi ? `${hh}:${mi}${seconds && ss ? `:${ss}` : ""}` : null;
  return t.formatDateTime({ year, month, day, time });
}

/**
 * The server's own timestamps (`fetched_at`, `created_at`) are UTC instants,
 * unlike the note's emission time, so they are moved to the device's time zone
 * first. `Date`'s local getters do that without needing `Intl`.
 */
export function instant(iso: string | null | undefined, t: Strings): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const two = (n: number) => String(n).padStart(2, "0");
  return t.formatDateTime({
    year: String(d.getFullYear()),
    month: two(d.getMonth() + 1),
    day: two(d.getDate()),
    time: `${two(d.getHours())}:${two(d.getMinutes())}`,
  });
}

/** "06057200000000" -> "06.057.200/0000-00"; anything not 14 digits is left as stored. */
export function cnpj(digits: string | null | undefined): string | null {
  if (!digits) return null;
  return /^\d{14}$/.test(digits)
    ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
    : digits;
}

/** "12345678909" -> "123.456.789-09"; a masked or partial CPF is left as stored. */
export function cpf(digits: string | null | undefined): string | null {
  if (!digits) return null;
  return /^\d{11}$/.test(digits)
    ? digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")
    : digits;
}

/** The chave in groups of four, the way the receipt prints it. */
export function chaveGroups(chave: string): string {
  return chave.replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** 48213 -> "47 KB". Whole units, so no decimal separator has to be chosen. */
export function fileSize(bytes: number | null | undefined): string | null {
  if (typeof bytes !== "number" || !Number.isFinite(bytes)) return null;
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "http://192.168.1.10:3000" -> "192.168.1.10:3000" — short enough for a header line. */
export function hostLabel(baseUrl: string): string {
  return baseUrl.replace(/^https?:\/\//, "");
}
