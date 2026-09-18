import AsyncStorage from "@react-native-async-storage/async-storage";
import { isLanguageSetting } from "./i18n/language";
import type { LanguageSetting } from "./i18n/language";
import { isThemeSetting } from "./theme/scheme";
import type { ThemeSetting } from "./theme/scheme";

/**
 * Where the backend lives is the whole of this app's setup, and it is not a
 * secret: a plain key/value store is the right home for it.
 */
const URL_KEY = "nf-price-tracker:backend-url";
const NAME_KEY = "nf-price-tracker:backend-name";
const LANGUAGE_KEY = "nf-price-tracker:language";
const THEME_KEY = "nf-price-tracker:theme";

export type Server = {
  baseUrl: string;
  /** Set in Settings › Server; `null` until then, and shown as the default name. */
  name: string | null;
};

/** `null` on a first run — and on a storage failure, which onboards again rather than crashing. */
export async function loadServer(): Promise<Server | null> {
  try {
    const [baseUrl, name] = await Promise.all([
      AsyncStorage.getItem(URL_KEY),
      AsyncStorage.getItem(NAME_KEY),
    ]);
    return baseUrl ? { baseUrl, name } : null;
  } catch (err) {
    console.warn("[storage] could not read the saved server", err);
    return null;
  }
}

export async function saveServer({ baseUrl, name }: Server): Promise<void> {
  try {
    await Promise.all([
      AsyncStorage.setItem(URL_KEY, baseUrl),
      name ? AsyncStorage.setItem(NAME_KEY, name) : AsyncStorage.removeItem(NAME_KEY),
    ]);
  } catch (err) {
    // Worst case the user onboards again next launch; never block the app.
    console.warn("[storage] could not save the server", err);
  }
}

/**
 * "system" on a first run -- and whenever the stored value is missing, damaged
 * or from a build that spoke a language this one does not.
 */
export async function loadLanguageSetting(): Promise<LanguageSetting> {
  try {
    const stored = await AsyncStorage.getItem(LANGUAGE_KEY);
    return isLanguageSetting(stored) ? stored : "system";
  } catch (err) {
    console.warn("[storage] could not read the language setting", err);
    return "system";
  }
}

export async function saveLanguageSetting(setting: LanguageSetting): Promise<void> {
  try {
    await AsyncStorage.setItem(LANGUAGE_KEY, setting);
  } catch (err) {
    // The app keeps the choice for this run either way; only persistence is lost.
    console.warn("[storage] could not save the language setting", err);
  }
}

/** "system" on a first run, and whenever the stored value is not one we know. */
export async function loadThemeSetting(): Promise<ThemeSetting> {
  try {
    const stored = await AsyncStorage.getItem(THEME_KEY);
    return isThemeSetting(stored) ? stored : "system";
  } catch (err) {
    console.warn("[storage] could not read the theme setting", err);
    return "system";
  }
}

export async function saveThemeSetting(setting: ThemeSetting): Promise<void> {
  try {
    await AsyncStorage.setItem(THEME_KEY, setting);
  } catch (err) {
    // The app keeps the choice for this run either way; only persistence is lost.
    console.warn("[storage] could not save the theme setting", err);
  }
}
