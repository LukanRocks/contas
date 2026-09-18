import { StyleSheet, Text, View } from "react-native";
import { brl, dateTime, plural } from "../format";
import { useStrings } from "../i18n";
import { useTheme } from "../theme";
import type { NoteSummary } from "../types";

/**
 * One scanned note in the list. The parser leaves any field it could not read
 * as null, so every cell has to survive being empty -- an em dash stands in,
 * the same placeholder the web list uses.
 */
export function NoteRow({ note }: { note: NoteSummary }) {
  const theme = useTheme();
  const t = useStrings();
  // What the shopper actually paid, when the note says so; the items total otherwise.
  const total = brl(note.payable_c ?? note.total_value_c) ?? "—";

  return (
    <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.main}>
        <Text style={[styles.store, { color: theme.text }]} numberOfLines={2}>
          {note.emit_name ?? t.home.unknownStore}
        </Text>
        <Text style={[styles.meta, { color: theme.muted }]} numberOfLines={1}>
          {dateTime(note.emitted_at, t) ?? t.home.noEmissionDate} ·{" "}
          {plural(note.item_count, t.units.item, t.units.items)}
        </Text>
      </View>
      <Text style={[styles.total, { color: theme.text }]}>{total}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  main: { flex: 1, gap: 2 },
  store: { fontSize: 15.5, fontWeight: "600" },
  meta: { fontSize: 13 },
  total: { fontSize: 16, fontWeight: "700", fontVariant: ["tabular-nums"] },
});
