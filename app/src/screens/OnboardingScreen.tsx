import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, checkBackend, normalizeBaseUrl } from "../api";
import { useTheme } from "../theme";

type Props = {
  /** Pre-filled when the user came here to change a server, empty on a first run. */
  initialUrl?: string | null;
  onConnected: (baseUrl: string) => void;
};

/**
 * First-run setup: the app is a client for a self-hosted backend, so it cannot
 * do anything until it is told where that backend is. The address is only
 * handed back — and therefore only stored — once `/api/health` has confirmed
 * something is actually listening there.
 */
export function OnboardingScreen({ initialUrl, onConnected }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState(initialUrl ?? "");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Shown under the field so it is obvious what will be contacted -- a typed
  // "192.168.1.10:3000" becomes a full URL, and that should not be a surprise.
  let preview: string | null = null;
  try {
    preview = value.trim() ? `${normalizeBaseUrl(value)}/api/health` : null;
  } catch {
    preview = null;
  }

  async function submit() {
    if (checking) return;
    setError(null);

    let baseUrl: string;
    try {
      baseUrl = normalizeBaseUrl(value);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
      return;
    }

    setChecking(true);
    try {
      await checkBackend(baseUrl);
      onConnected(baseUrl);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Falha inesperada: ${String(err)}`);
    } finally {
      setChecking(false);
    }
  }

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
        <Text style={[styles.subtitle, { color: theme.muted }]}>
          Suas notas ficam no seu servidor. Informe o endereço dele para começar.
        </Text>

        <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.label, { color: theme.text }]}>Endereço do servidor</Text>

          <TextInput
            value={value}
            onChangeText={(next) => {
              setValue(next);
              if (error) setError(null);
            }}
            onSubmitEditing={submit}
            editable={!checking}
            placeholder="192.168.1.10:3000"
            placeholderTextColor={theme.muted}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            keyboardType="url"
            inputMode="url"
            returnKeyType="go"
            autoFocus
            style={[
              styles.input,
              { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text },
            ]}
          />

          <Text style={[styles.hint, { color: theme.muted }]} numberOfLines={2}>
            {preview ? `Vamos testar ${preview}` : "http:// e https:// são aceitos."}
          </Text>

          {error ? (
            <View style={[styles.errorBox, { backgroundColor: theme.errBg }]}>
              <Text style={[styles.errorText, { color: theme.errText }]}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={submit}
            disabled={checking || !value.trim()}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.button,
              {
                backgroundColor: theme.accent,
                opacity: checking || !value.trim() ? 0.55 : pressed ? 0.85 : 1,
              },
            ]}
          >
            {checking ? (
              <ActivityIndicator color={theme.accentText} />
            ) : (
              <Text style={[styles.buttonText, { color: theme.accentText }]}>Continuar</Text>
            )}
          </Pressable>
        </View>

        <Text style={[styles.footnote, { color: theme.muted }]}>
          O endereço fica salvo no aparelho: nas próximas aberturas o app vai direto para as notas.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 8 },
  title: { fontSize: 26, fontWeight: "700", letterSpacing: -0.4 },
  subtitle: { fontSize: 15, lineHeight: 21, marginBottom: 20 },
  panel: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 10 },
  label: { fontSize: 15, fontWeight: "600" },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16 },
  hint: { fontSize: 12.5, lineHeight: 17 },
  errorBox: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  errorText: { fontSize: 13.5, lineHeight: 19 },
  button: { borderRadius: 8, paddingVertical: 14, alignItems: "center", justifyContent: "center", minHeight: 48 },
  buttonText: { fontSize: 16, fontWeight: "600" },
  footnote: { fontSize: 12.5, lineHeight: 18, marginTop: 16 },
});
