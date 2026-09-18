/** The two palettes the app ships. */
export const COLOR_SCHEMES = ["light", "dark"] as const;

export type ColorScheme = (typeof COLOR_SCHEMES)[number];

/** What the user picked in Settings: a palette, or "follow the device". */
export type ThemeSetting = ColorScheme | "system";

export const THEME_SETTINGS = ["system", ...COLOR_SCHEMES] as const;

/**
 * Which palette to render in. The device's answer is typed as loosely as the
 * platforms report it -- null, undefined, or "unspecified" on an Android that
 * has no preference set -- and anything that is not "dark" reads as light, the
 * same default the web front end's `prefers-color-scheme` falls back to.
 */
export function resolveScheme(
  setting: ThemeSetting,
  deviceScheme: string | null | undefined,
): ColorScheme {
  if (setting !== "system") return setting;
  return deviceScheme === "dark" ? "dark" : "light";
}

/** Guards what comes back from the device's store, which is just a string. */
export function isThemeSetting(value: unknown): value is ThemeSetting {
  return typeof value === "string" && (THEME_SETTINGS as readonly string[]).includes(value);
}
