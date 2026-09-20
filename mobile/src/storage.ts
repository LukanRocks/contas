import AsyncStorage from "@react-native-async-storage/async-storage";
import { isLanguageSetting } from "./i18n/language";
import type { LanguageSetting } from "./i18n/language";
import { isStartTab } from "./startTab";
import type { StartTab } from "./startTab";
import { isThemeSetting } from "./theme/scheme";
import type { ThemeSetting } from "./theme/scheme";

/**
 * Where the backend lives is the whole of this app's setup, and it is not a
 * secret: a plain key/value store is the right home for it.
 */
const PREFIX = "contas:";

/**
 * The keys were prefixed with the project's old name until the rename. Reading
 * through to them spares a device that has already onboarded from doing it
 * again -- which only comes up while the pre-rename build is still installed,
 * since the new bundle identifier gets a sandbox of its own. Drop this and
 * `read`'s second lookup once that build is gone.
 */
const LEGACY_PREFIX = "nf-price-tracker:";

const URL_KEY = `${PREFIX}backend-url`;
const NAME_KEY = `${PREFIX}backend-name`;
const LANGUAGE_KEY = `${PREFIX}language`;
const THEME_KEY = `${PREFIX}theme`;
const START_TAB_KEY = `${PREFIX}start-tab`;

/** `getItem`, falling back to the pre-rename key and moving the value forward. */
async function read(key: string): Promise<string | null> {
  const stored = await AsyncStorage.getItem(key);
  if (stored !== null) return stored;

  const legacyKey = LEGACY_PREFIX + key.slice(PREFIX.length);
  const legacy = await AsyncStorage.getItem(legacyKey);
  if (legacy === null) return null;

  // Carried forward, so the extra lookup is paid exactly once.
  await Promise.all([AsyncStorage.setItem(key, legacy), AsyncStorage.removeItem(legacyKey)]);
  return legacy;
}

export type Server = {
  baseUrl: string;
  /** Set in Settings › Server; `null` until then, and shown as the default name. */
  name: string | null;
};

/** `null` on a first run — and on a storage failure, which onboards again rather than crashing. */
export async function loadServer(): Promise<Server | null> {
  try {
    const [baseUrl, name] = await Promise.all([read(URL_KEY), read(NAME_KEY)]);
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
    const stored = await read(LANGUAGE_KEY);
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
    const stored = await read(THEME_KEY);
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

/** The notes on a first run, and whenever the stored value is not a tab we know. */
export async function loadStartTab(): Promise<StartTab> {
  try {
    const stored = await read(START_TAB_KEY);
    return isStartTab(stored) ? stored : "Home";
  } catch (err) {
    console.warn("[storage] could not read the start tab", err);
    return "Home";
  }
}

export async function saveStartTab(tab: StartTab): Promise<void> {
  try {
    await AsyncStorage.setItem(START_TAB_KEY, tab);
  } catch (err) {
    // The app opens on the notes next time instead; only persistence is lost.
    console.warn("[storage] could not save the start tab", err);
  }
}
