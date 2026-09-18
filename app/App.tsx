import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, useColorScheme, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { DarkTheme, DefaultTheme, NavigationContainer } from "@react-navigation/native";
import type { Theme as NavigationTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
// One module per icon: Metro does not tree-shake, so the package's index would
// bundle every icon Lucide has.
import House from "lucide-react-native/icons/house";
import ScanQrCode from "lucide-react-native/icons/scan-qr-code";
import Settings from "lucide-react-native/icons/settings";
import { useLocales } from "expo-localization";
import { BackendContext } from "./src/backend";
import { I18nContext, useStrings } from "./src/i18n";
import { resolveLanguage } from "./src/i18n/language";
import type { LanguageSetting } from "./src/i18n/language";
import { BUNDLES } from "./src/i18n/strings";
import type { SettingsStackParamList, TabParamList } from "./src/navigation";
import { HomeScreen } from "./src/screens/HomeScreen";
import { OnboardingScreen } from "./src/screens/OnboardingScreen";
import { ScanScreen } from "./src/screens/ScanScreen";
import { LanguageScreen } from "./src/screens/LanguageScreen";
import { ServerScreen } from "./src/screens/ServerScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { ThemeScreen } from "./src/screens/ThemeScreen";
import {
  loadLanguageSetting,
  loadServer,
  loadThemeSetting,
  saveLanguageSetting,
  saveServer,
  saveThemeSetting,
} from "./src/storage";
import type { Server } from "./src/storage";
import { PALETTES, ThemeContext, useTheme } from "./src/theme";
import type { Theme } from "./src/theme";
import { resolveScheme } from "./src/theme/scheme";
import type { ThemeSetting } from "./src/theme/scheme";

/**
 * Until a server is known there is nothing to navigate to, so onboarding sits
 * outside the navigator and is shown by a piece of state. Once an address is
 * saved the app is the tab bar: Scan, Notes and Settings, where the server
 * is changed from then on.
 */
type Boot =
  | { status: "loading" }
  | { status: "onboarding" }
  | { status: "ready"; server: Server };

const Tab = createBottomTabNavigator<TabParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

function App() {
  const [boot, setBoot] = useState<Boot>({ status: "loading" });
  const [languageSetting, setLanguageSetting] = useState<LanguageSetting>("system");
  const [themeSetting, setThemeSetting] = useState<ThemeSetting>("system");

  // The device's own preferences, both of which update live if the phone is
  // changed while the app is open.
  const locales = useLocales();
  const deviceScheme = useColorScheme();

  // One read of the device's store, on launch. Nothing is rendered before it
  // answers, so a returning user never sees onboarding flash by -- or the app
  // in a language they turned off.
  useEffect(() => {
    let cancelled = false;
    void Promise.all([loadServer(), loadLanguageSetting(), loadThemeSetting()]).then(
      ([saved, language, themePick]) => {
        if (cancelled) return;
        setLanguageSetting(language);
        setThemeSetting(themePick);
        setBoot(saved ? { status: "ready", server: saved } : { status: "onboarding" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const setLanguage = useCallback((next: LanguageSetting) => {
    setLanguageSetting(next);
    void saveLanguageSetting(next);
  }, []);

  const setTheme = useCallback((next: ThemeSetting) => {
    setThemeSetting(next);
    void saveThemeSetting(next);
  }, []);

  const i18n = useMemo(() => {
    const language = resolveLanguage(
      languageSetting,
      locales.map((locale) => locale.languageTag),
    );
    return { t: BUNDLES[language], setting: languageSetting, language, setLanguage };
  }, [languageSetting, locales, setLanguage]);

  const themeChoice = useMemo(() => {
    const scheme = resolveScheme(themeSetting, deviceScheme);
    return { theme: PALETTES[scheme], setting: themeSetting, scheme, setTheme };
  }, [themeSetting, deviceScheme, setTheme]);

  // From onboarding and from Settings › Server. A new address has always
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
    <ThemeContext value={themeChoice}>
      <I18nContext value={i18n}>
        <Shell loading={boot.status === "loading"} backend={backend} onConnected={setServer} />
      </I18nContext>
    </ThemeContext>
  );
}

type ShellProps = {
  loading: boolean;
  backend: React.ContextType<typeof BackendContext>;
  onConnected: (server: Server) => void;
};

/** Everything that reads the palette, which App is above rather than inside. */
function Shell({ loading, backend, onConnected }: ShellProps) {
  const theme = useTheme();
  const navigationTheme = useMemo(() => toNavigationTheme(theme), [theme]);

  return (
    <View style={[styles.flex, { backgroundColor: theme.bg }]}>
      <StatusBar style={theme.dark ? "light" : "dark"} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : !backend ? (
        <OnboardingScreen onConnected={onConnected} />
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
  const t = useStrings();

  return (
    <Tab.Navigator
      // Scanning sits left of the notes, but the app still opens on them.
      initialRouteName="Home"
      screenOptions={{ headerShown: false, tabBarInactiveTintColor: theme.muted }}
    >
      <Tab.Screen
        name="Scan"
        component={ScanScreen}
        options={{
          title: t.tabs.scan,
          tabBarIcon: ({ focused, color, size }) => (
            <ScanQrCode color={color} size={size} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: t.tabs.home,
          tabBarIcon: ({ focused, color, size }) => (
            <House color={color} size={size} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsNavigator}
        options={{
          title: t.tabs.settings,
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
  const t = useStrings();

  return (
    <SettingsStack.Navigator>
      <SettingsStack.Screen
        name="SettingsHome"
        component={SettingsScreen}
        options={{ title: t.settings.title, headerShown: false }}
      />
      <SettingsStack.Screen
        name="Server"
        component={ServerScreen}
        options={{ title: t.server.screenTitle }}
      />
      <SettingsStack.Screen
        name="Language"
        component={LanguageScreen}
        options={{ title: t.language.screenTitle }}
      />
      <SettingsStack.Screen
        name="Theme"
        component={ThemeScreen}
        options={{ title: t.theme.screenTitle }}
      />
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
