import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Where the backend lives is the whole of this app's setup, and it is not a
 * secret: a plain key/value store is the right home for it.
 */
const KEY = "nf-price-tracker:backend-url";

/** `null` on a first run — and on a storage failure, which onboards again rather than crashing. */
export async function loadBackendUrl(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY);
  } catch (err) {
    console.warn("[storage] could not read the saved backend URL", err);
    return null;
  }
}

export async function saveBackendUrl(baseUrl: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, baseUrl);
  } catch (err) {
    // Worst case the user onboards again next launch; never block the app.
    console.warn("[storage] could not save the backend URL", err);
  }
}

export async function clearBackendUrl(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch (err) {
    console.warn("[storage] could not clear the backend URL", err);
  }
}
