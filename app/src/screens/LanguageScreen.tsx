import Check from "lucide-react-native/icons/check";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useI18n } from "../i18n";
import { LANGUAGE_SETTINGS } from "../i18n/language";
import type { LanguageSetting } from "../i18n/language";
import { useTheme } from "../theme";

/**
 * Settings › Language. Following the device is the default and stays
 * selectable, so a phone that changes language later carries the app with it
 * -- picking a language explicitly is what pins it.
 */
export function LanguageScreen() {
  const theme = useTheme();
  const { t, setting, language, setLanguage } = useI18n();

  const label = (option: LanguageSetting) =>
    option === "system" ? t.language.system : t.language.names[option];

  return (
    <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={styles.content}>
      <View style={[styles.group, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {LANGUAGE_SETTINGS.map((option, index) => (
          <Pressable
            key={option}
            onPress={() => setLanguage(option)}
            accessibilityRole="radio"
            accessibilityState={{ selected: setting === option }}
            style={({ pressed }) => [
              styles.row,
              index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: theme.text }]}>{label(option)}</Text>
              {option === "system" ? (
                <Text style={[styles.rowHint, { color: theme.muted }]}>
                  {t.language.systemHint(t.language.names[language])}
                </Text>
              ) : null}
            </View>
            {setting === option ? <Check size={18} color={theme.accent} /> : null}
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16 },
  group: { borderWidth: 1, borderRadius: 10, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 52,
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15.5 },
  rowHint: { fontSize: 12.5 },
});
