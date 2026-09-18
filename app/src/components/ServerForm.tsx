import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ApiError, checkBackend, normalizeBaseUrl } from "../api";
import { useStrings } from "../i18n";
import type { Server } from "../storage";
import { useTheme } from "../theme";

type Props = {
  /** The saved server, when editing it. Onboarding has none, and asks only for the address. */
  current?: Server;
  submitLabel: string;
  onSaved: (server: Server) => void;
};

/**
 * The backend address field, shared by onboarding and Ajustes › Servidor, plus
 * a name in the latter. A new address is only handed back — and therefore only
 * stored — once `/api/health` has confirmed something is actually listening
 * there.
 */
export function ServerForm({ current, submitLabel, onSaved }: Props) {
  const theme = useTheme();
  const t = useStrings();
  const urlInput = useRef<TextInput>(null);
  const [name, setName] = useState(current?.name ?? "");
  const [value, setValue] = useState(current?.baseUrl ?? "");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Shown under the field so it is obvious what will be contacted -- a typed
  // "192.168.1.10:3000" becomes a full URL, and that should not be a surprise.
  let normalized: string | null = null;
  try {
    normalized = value.trim() ? normalizeBaseUrl(value) : null;
  } catch {
    normalized = null;
  }
  const hint = !normalized
    ? t.server.schemesAccepted
    : normalized === current?.baseUrl
      ? t.server.addressInUse
      : t.server.willTest(`${normalized}/api/health`);

  async function submit() {
    if (checking) return;
    setError(null);

    let baseUrl: string;
    try {
      baseUrl = normalizeBaseUrl(value);
    } catch (err) {
      setError(err instanceof ApiError ? err.describe(t) : t.errors.unexpected(String(err)));
      return;
    }

    setChecking(true);
    try {
      // The address in use answered when it was saved; renaming a server
      // should not depend on it being reachable right now.
      if (baseUrl !== current?.baseUrl) await checkBackend(baseUrl);
      onSaved({ baseUrl, name: name.trim() || null });
    } catch (err) {
      setError(err instanceof ApiError ? err.describe(t) : t.errors.unexpected(String(err)));
    } finally {
      setChecking(false);
    }
  }

  const inputStyle = [
    styles.input,
    { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text },
  ];

  return (
    <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {current ? (
        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.text }]}>{t.server.nameLabel}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            onSubmitEditing={() => urlInput.current?.focus()}
            editable={!checking}
            placeholder={t.server.defaultName}
            placeholderTextColor={theme.muted}
            maxLength={40}
            returnKeyType="next"
            submitBehavior="submit"
            style={inputStyle}
          />
        </View>
      ) : null}

      <Text style={[styles.label, { color: theme.text }]}>{t.server.addressLabel}</Text>

      <TextInput
        ref={urlInput}
        value={value}
        onChangeText={(next) => {
          setValue(next);
          if (error) setError(null);
        }}
        onSubmitEditing={submit}
        editable={!checking}
        placeholder={t.server.addressPlaceholder}
        placeholderTextColor={theme.muted}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        keyboardType="url"
        inputMode="url"
        returnKeyType="go"
        // Onboarding has nothing else to ask; with a name too, let the user pick.
        autoFocus={!current}
        style={inputStyle}
      />

      <Text style={[styles.hint, { color: theme.muted }]} numberOfLines={2}>
        {hint}
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
          <Text style={[styles.buttonText, { color: theme.accentText }]}>{submitLabel}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 10 },
  field: { gap: 10, marginBottom: 6 },
  label: { fontSize: 15, fontWeight: "600" },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16 },
  hint: { fontSize: 12.5, lineHeight: 17 },
  errorBox: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  errorText: { fontSize: 13.5, lineHeight: 19 },
  button: { borderRadius: 8, paddingVertical: 14, alignItems: "center", justifyContent: "center", minHeight: 48 },
  buttonText: { fontSize: 16, fontWeight: "600" },
});
