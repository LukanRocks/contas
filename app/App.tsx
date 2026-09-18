import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import type { Theme as NavigationTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
// One module per icon: Metro does not tree-shake, so the package's index would
// bundle every icon Lucide has.
import House from "lucide-react-native/icons/house";
import Settings from "lucide-react-native/icons/settings";
import { BackendContext } from "./src/backend";
import type { SettingsStackParamList, TabParamList } from "./src/navigation";
import { HomeScreen } from "./src/screens/HomeScreen";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { ServerScreen } from "./src/screens/ServerScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { loadServer, saveServer } from "./src/storage";
import type { Server } from "./src/storage";
import { useTheme } from "./src/theme";
import type { Theme } from "./src/theme";

/**
 * Until a server is known there is nothing to navigate to, so onboarding sits
 * outside the navigator and is shown by a piece of state. Once an address is
 * saved the app is the tab bar: Início (the notes) and Ajustes, where the
 * server is changed from then on.
 */
type Boot =
  | { status: "loading" }
  | { status: "onboarding" }
  | { status: "ready"; server: Server };

const Tab = createBottomTabNavigator<TabParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

function App() {
  const theme = useTheme();
  const navigationTheme = useMemo(() => toNavigationTheme(theme), [theme]);
  const [boot, setBoot] = useState<Boot>({ status: "loading" });

  // One read of the device's store, on launch. Nothing is rendered before it
  // answers, so a returning user never sees onboarding flash by.
  useEffect(() => {
    let cancelled = false;
    void loadServer().then((saved) => {
      if (cancelled) return;
      setBoot(saved ? { status: "ready", server: saved } : { status: "onboarding" });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // From onboarding and from Ajustes › Servidor. A new address has always
  // just answered /api/health; an unchanged one is only being renamed.
  const setServer = useCallback((server: Server) => {
    setBoot({ status: "ready", server });
    void saveServer(server);
  }, []);

  const backend = useMemo(
    () => (boot.status === "ready" ? { ...boot.server, setServer } : null),
    [boot, setServer],
  );

  return (
    <View style={[styles.flex, { backgroundColor: theme.bg }]}>
      <StatusBar style={theme.dark ? "light" : "dark"} />
      {boot.status === "loading" ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : !backend ? (
        <OnboardingScreen onConnected={setServer} />
      ) : (
        <BackendContext value={backend}>
          <NavigationContainer theme={navigationTheme}>
            <Tabs />
          </NavigationContainer>
        </BackendContext>
      )}
    </View>
  );
}

function Tabs() {
  const theme = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false, tabBarInactiveTintColor: theme.muted }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: "Início",
          tabBarIcon: ({ focused, color, size }) => (
            <House color={color} size={size} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsNavigator}
        options={{
          title: "Ajustes",
          tabBarIcon: ({ focused, color, size }) => (
            <Settings color={color} size={size} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

/** A stack so each option opens as its own screen, with a back button and swipe. */
function SettingsNavigator() {
  return (
    <SettingsStack.Navigator>
      <SettingsStack.Screen
        name="SettingsHome"
        component={SettingsScreen}
        options={{ title: "Ajustes", headerShown: false }}
      />
      <SettingsStack.Screen name="Server" component={ServerScreen} options={{ title: "Servidor" }} />
    </SettingsStack.Navigator>
  );
}

/** Tab bar and stack headers in the app's palette, over React Navigation's own fonts. */
function toNavigationTheme(theme: Theme): NavigationTheme {
  const base = theme.dark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: theme.accent,
      background: theme.bg,
      card: theme.bg,
      text: theme.text,
      border: theme.border,
      notification: theme.errText,
    },
  };
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
