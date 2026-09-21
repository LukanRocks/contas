import ChevronRight from "lucide-react-native/icons/chevron-right";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { brl, dateTime, plural } from "../format";
import { useStrings } from "../i18n";
import { useTheme } from "../theme";
import type { NoteSummary } from "../types";

/**
 * One scanned note in the list; pressing it opens the whole note. The parser
 * leaves any field it could not read as null, so every cell has to survive
 * being empty -- an em dash stands in, the same placeholder the web list uses.
 */
export function NoteRow({ note, onPress }: { note: NoteSummary; onPress: () => void }) {
  const theme = useTheme();
  const t = useStrings();
  // What the shopper actually paid, when the note says so; the items total otherwise.
  const total = brl(note.payable_c ?? note.total_value_c) ?? "—";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint={t.notes.openHint}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <View style={styles.main}>
        <Text style={[styles.store, { color: theme.text }]} numberOfLines={2}>
          {note.emit_name ?? t.notes.unknownStore}
        </Text>
        <Text style={[styles.meta, { color: theme.muted }]} numberOfLines={1}>
          {dateTime(note.emitted_at, t) ?? t.notes.noEmissionDate} ·{" "}
          {plural(note.item_count, t.units.item, t.units.items)}
        </Text>
      </View>
      <Text style={[styles.total, { color: theme.text }]}>{total}</Text>
      <ChevronRight size={18} color={theme.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 10,
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 12,
  },
  main: { flex: 1, gap: 2 },
  store: { fontSize: 15.5, fontWeight: "600" },
  meta: { fontSize: 13 },
  total: { fontSize: 16, fontWeight: "700", fontVariant: ["tabular-nums"] },
});
