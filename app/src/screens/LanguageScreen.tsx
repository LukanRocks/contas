import { ScrollView, StyleSheet } from "react-native";
import { ChoiceList } from "../components/ChoiceList";
import type { Choice } from "../components/ChoiceList";
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

  const options: Choice<LanguageSetting>[] = LANGUAGE_SETTINGS.map((option) =>
    option === "system"
      ? {
          key: option,
          label: t.settings.deviceDefault,
          hint: t.settings.followingDevice(t.language.names[language]),
        }
      : { key: option, label: t.language.names[option] },
  );

  return (
    <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={styles.content}>
      <ChoiceList options={options} selected={setting} onSelect={setLanguage} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16 },
});
