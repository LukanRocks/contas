import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ServerForm } from "../components/ServerForm";
import { useStrings } from "../i18n";
import type { Server } from "../storage";
import { useTheme } from "../theme";

type Props = {
  onConnected: (server: Server) => void;
};

/**
 * First-run setup: the app is a client for a self-hosted backend, so it cannot
 * do anything until it is told where that backend is. Changing it later is
 * Settings › Server, which uses the same form.
 */
export function OnboardingScreen({ onConnected }: Props) {
  const theme = useTheme();
  const t = useStrings();
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.title, { color: theme.text }]}>nf-price-tracker</Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>{t.onboarding.subtitle}</Text>

        <ServerForm submitLabel={t.onboarding.submit} onSaved={onConnected} />

        <Text style={[styles.footnote, { color: theme.muted }]}>{t.onboarding.footnote}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 8 },
  title: { fontSize: 26, fontWeight: "700", letterSpacing: -0.4 },
  subtitle: { fontSize: 15, lineHeight: 21, marginBottom: 20 },
  footnote: { fontSize: 12.5, lineHeight: 18, marginTop: 16 },
});
