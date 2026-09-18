import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { HomeScreen } from "./src/screens/HomeScreen";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { clearBackendUrl, loadBackendUrl, saveBackendUrl } from "./src/storage";
import { useTheme } from "./src/theme";

/**
 * Two screens and one decision between them, so the routing is a piece of
 * state rather than a navigator: a saved backend URL means the app opens on
 * the notes, and its absence means onboarding. `lastUrl` survives the switch so
 * "Servidor" reopens onboarding with the current address already typed in.
 */
type Route =
  | { screen: "loading" }
  | { screen: "onboarding"; lastUrl: string | null }
  | { screen: "home"; baseUrl: string };

function App() {
  const theme = useTheme();
  const [route, setRoute] = useState<Route>({ screen: "loading" });

  // One read of the device's store, on launch. Nothing is rendered before it
  // answers, so a returning user never sees onboarding flash by.
  useEffect(() => {
    let cancelled = false;
    void loadBackendUrl().then((saved) => {
      if (cancelled) return;
      setRoute(saved ? { screen: "home", baseUrl: saved } : { screen: "onboarding", lastUrl: null });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Only ever called with an address /api/health has already answered on.
  const handleConnected = useCallback((baseUrl: string) => {
    setRoute({ screen: "home", baseUrl });
    void saveBackendUrl(baseUrl);
  }, []);

  const handleChangeServer = useCallback(() => {
    setRoute((current) => ({
      screen: "onboarding",
      lastUrl: current.screen === "home" ? current.baseUrl : null,
    }));
    // Forgotten right away: if the app is killed mid-change, the next launch
    // should ask rather than reopen a server the user was walking away from.
    void clearBackendUrl();
  }, []);

  return (
    <View style={[styles.flex, { backgroundColor: theme.bg }]}>
      <StatusBar style={theme.dark ? "light" : "dark"} />
      {route.screen === "loading" ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : route.screen === "onboarding" ? (
        <OnboardingScreen initialUrl={route.lastUrl} onConnected={handleConnected} />
      ) : (
        <HomeScreen baseUrl={route.baseUrl} onChangeServer={handleChangeServer} />
      )}
    </View>
  );
}

/** The provider has to sit above anything that reads safe-area insets. */
export default function Root() {
  return (
    <SafeAreaProvider>
      <App />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
