/** The two languages the app speaks. */
export const LANGUAGES = ["pt", "en"] as const;

export type Language = (typeof LANGUAGES)[number];

/** What the user picked in Settings: a language, or "follow the device". */
export type LanguageSetting = Language | "system";

export const LANGUAGE_SETTINGS = ["system", ...LANGUAGES] as const;

/**
 * Which language to render in. "system" walks the device's preferred languages
 * in order and takes the first one the app speaks -- a phone set to
 * pt-BR, then en-US, gets Portuguese; one set to fr-FR, which the app does not
 * speak, gets English rather than a language it also cannot read.
 */
export function resolveLanguage(
  setting: LanguageSetting,
  deviceTags: readonly string[],
): Language {
  if (setting !== "system") return setting;

  for (const tag of deviceTags) {
    // "pt-BR", "pt_BR" and "PT" all mean the same thing here: only the
    // language subtag matters, since neither language is region-specific.
    const code = tag.toLowerCase().split(/[-_]/)[0];
    if (code === "pt") return "pt";
    if (code === "en") return "en";
  }

  return "en";
}

/** Guards what comes back from the device's store, which is just a string. */
export function isLanguageSetting(value: unknown): value is LanguageSetting {
  return typeof value === "string" && (LANGUAGE_SETTINGS as readonly string[]).includes(value);
}
