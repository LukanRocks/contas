import Check from "lucide-react-native/icons/check";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme";

export type Choice<T extends string> = {
  key: T;
  label: string;
  /** Only the "follow the device" row has one: what the device currently says. */
  hint?: string;
};

type Props<T extends string> = {
  options: readonly Choice<T>[];
  selected: T;
  onSelect: (key: T) => void;
};

/** One settings choice, ticked. Shared by Settings › Language, › Appearance and › Start screen. */
export function ChoiceList<T extends string>({ options, selected, onSelect }: Props<T>) {
  const theme = useTheme();

  return (
    <View style={[styles.group, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {options.map((option, index) => (
        <Pressable
          key={option.key}
          onPress={() => onSelect(option.key)}
          accessibilityRole="radio"
          accessibilityState={{ selected: selected === option.key }}
          style={({ pressed }) => [
            styles.row,
            index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>{option.label}</Text>
            {option.hint ? (
              <Text style={[styles.rowHint, { color: theme.muted }]}>{option.hint}</Text>
            ) : null}
          </View>
          {selected === option.key ? <Check size={18} color={theme.accent} /> : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
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
