import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Languages from "lucide-react-native/icons/languages";
import Server from "lucide-react-native/icons/server";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useBackend } from "../backend";
import { ScreenHeader } from "../components/ScreenHeader";
import { hostLabel } from "../format";
import { useI18n } from "../i18n";
import type { SettingsStackParamList } from "../navigation";
import { useTheme } from "../theme";

/** Ajustes: which server the app reads from, and which language it speaks. */
export function SettingsScreen() {
  const theme = useTheme();
  const { baseUrl, name } = useBackend();
  const { t, setting, language } = useI18n();
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();

  return (
    <View style={[styles.flex, { backgroundColor: theme.bg }]}>
      <ScreenHeader title={t.settings.title} />
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          onPress={() => navigation.navigate("Server")}
          accessibilityRole="button"
          accessibilityHint={t.server.openHint}
          style={({ pressed }) => [
            styles.row,
            { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Server size={20} color={theme.accent} />
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
              {name ?? t.server.defaultName}
            </Text>
            <Text style={[styles.rowValue, { color: theme.muted }]} numberOfLines={1}>
              {hostLabel(baseUrl)}
            </Text>
          </View>
          <ChevronRight size={18} color={theme.muted} />
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate("Language")}
          accessibilityRole="button"
          accessibilityHint={t.settings.languageOpenHint}
          style={({ pressed }) => [
            styles.row,
            styles.spaced,
            { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Languages size={20} color={theme.accent} />
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
              {t.settings.languageRow}
            </Text>
            <Text style={[styles.rowValue, { color: theme.muted }]} numberOfLines={1}>
              {setting === "system" ? t.language.system : t.language.names[language]}
            </Text>
          </View>
          <ChevronRight size={18} color={theme.muted} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 56,
  },
  spaced: { marginTop: 10 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15.5, fontWeight: "600" },
  rowValue: { fontSize: 13 },
});
