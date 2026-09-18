import { ScrollView, StyleSheet } from "react-native";
import { ChoiceList } from "../components/ChoiceList";
import type { Choice } from "../components/ChoiceList";
import { useStrings } from "../i18n";
import { useTheme, useThemeChoice } from "../theme";
import { THEME_SETTINGS } from "../theme/scheme";
import type { ThemeSetting } from "../theme/scheme";

/**
 * Settings › Appearance, the same shape as Settings › Language: the device
 * decides until a palette is picked, and picking one pins it whatever the
 * phone does later.
 */
export function ThemeScreen() {
  const theme = useTheme();
  const t = useStrings();
  const { setting, scheme, setTheme } = useThemeChoice();

  const options: Choice<ThemeSetting>[] = THEME_SETTINGS.map((option) =>
    option === "system"
      ? {
          key: option,
          label: t.settings.deviceDefault,
          hint: t.settings.followingDevice(t.theme.names[scheme]),
        }
      : { key: option, label: t.theme.names[option] },
  );

  return (
    <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={styles.content}>
      <ChoiceList options={options} selected={setting} onSelect={setTheme} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16 },
});
