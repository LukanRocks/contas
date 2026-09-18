import { useNavigation } from "@react-navigation/native";
import { ScrollView, StyleSheet, Text } from "react-native";
import { useBackend } from "../backend";
import { ServerForm } from "../components/ServerForm";
import { useTheme } from "../theme";

/**
 * Ajustes › Servidor: rename the server, or point the app at another one. The
 * saved address stays in force until a new one has answered `/api/health`, so
 * backing out halfway leaves the app as it was.
 */
export function ServerScreen() {
  const theme = useTheme();
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
        submitLabel="Salvar"
        onSaved={(next) => {
          setServer(next);
          navigation.goBack();
        }}
      />
      <Text style={[styles.footnote, { color: theme.muted }]}>
        O endereço atual continua valendo até o novo responder.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8 },
  footnote: { fontSize: 12.5, lineHeight: 18, marginTop: 8, paddingHorizontal: 4 },
});
