import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Where the backend lives is the whole of this app's setup, and it is not a
 * secret: a plain key/value store is the right home for it.
 */
const URL_KEY = "nf-price-tracker:backend-url";
const NAME_KEY = "nf-price-tracker:backend-name";

export type Server = {
  baseUrl: string;
  /** Set in Ajustes › Servidor; `null` until then, which reads as "Servidor". */
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
