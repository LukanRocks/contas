import { useNavigation } from "@react-navigation/native";
import { ScrollView, StyleSheet, Text } from "react-native";
import { useBackend } from "../backend";
import { ServerForm } from "../components/ServerForm";
import { useStrings } from "../i18n";
import { useTheme } from "../theme";

/**
 * Settings › Server: rename the server, or point the app at another one. The
 * saved address stays in force until a new one has answered `/api/health`, so
 * backing out halfway leaves the app as it was.
 */
export function ServerScreen() {
  const theme = useTheme();
  const t = useStrings();
  const { baseUrl, name, setServer } = useBackend();
  const navigation = useNavigation();

  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <ServerForm
        current={{ baseUrl, name }}
        submitLabel={t.server.save}
        onSaved={(next) => {
          setServer(next);
          navigation.goBack();
        }}
      />
      <Text style={[styles.footnote, { color: theme.muted }]}>
        {t.server.currentStaysUntilNewAnswers}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8 },
  footnote: { fontSize: 12.5, lineHeight: 18, marginTop: 8, paddingHorizontal: 4 },
});
