import { StyleSheet, Text, View } from "react-native";
import { ScreenHeader } from "../components/ScreenHeader";
import { useStrings } from "../i18n";
import { useTheme } from "../theme";

/**
 * The tab the app opens on, kept clear for what comes next. The notes moved
 * to their own tab so this one can grow into something else.
 */
export function HomeScreen() {
  const theme = useTheme();
  const t = useStrings();

  return (
    <View style={[styles.flex, { backgroundColor: theme.bg }]}>
      <ScreenHeader title={t.home.title} />
      <View style={styles.center}>
        <Text style={[styles.text, { color: theme.muted }]}>{t.home.placeholder}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  text: { fontSize: 14, lineHeight: 20, textAlign: "center" },
});
