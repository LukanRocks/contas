import { ScrollView, StyleSheet, Text } from "react-native";
import { ChoiceList } from "../components/ChoiceList";
import type { Choice } from "../components/ChoiceList";
import { useStrings } from "../i18n";
import { START_TABS, startTabLabel, useStartTab } from "../startTab";
import type { StartTab } from "../startTab";
import { useTheme } from "../theme";

/**
 * Settings › Start screen: the notes, or straight to the camera for someone
 * who mostly opens the app at the till. There is no device default to follow,
 * so the notes are simply the first choice.
 */
export function StartTabScreen() {
  const theme = useTheme();
  const t = useStrings();
  const { startTab, setStartTab } = useStartTab();

  const options: Choice<StartTab>[] = START_TABS.map((tab) => ({
    key: tab,
    label: startTabLabel(tab, t),
  }));

  return (
    <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={styles.content}>
      <ChoiceList options={options} selected={startTab} onSelect={setStartTab} />
      <Text style={[styles.footnote, { color: theme.muted }]}>{t.startTab.appliesNextStart}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16 },
  footnote: { fontSize: 12.5, lineHeight: 18, marginTop: 8, paddingHorizontal: 4 },
});
