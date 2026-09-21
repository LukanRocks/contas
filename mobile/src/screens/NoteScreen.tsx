import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import ExternalLink from "lucide-react-native/icons/external-link";
import { ApiError, getNote, noteHtmlUrl } from "../api";
import { useBackend } from "../backend";
import {
  brl,
  chaveGroups,
  cnpj,
  cpf,
  dateTime,
  fileSize,
  instant,
  plural,
  quantity,
} from "../format";
import { useStrings } from "../i18n";
import type { Strings } from "../i18n";
import type { NotesStackParamList } from "../navigation";
import { useTheme } from "../theme";
import type { NoteDetail, NoteItem } from "../types";

type Props = NativeStackScreenProps<NotesStackParamList, "Note">;

type State =
  | { status: "loading" }
  // Kept as the failure, not as words: the language can change while it is on screen.
  | { status: "error"; message: (t: Strings) => string }
  | { status: "ready"; note: NoteDetail };

/**
 * Everything the server knows about one note, in the web detail page's order:
 * who issued it, what it came to, who bought it, every line, and where it was
 * read from. The page itself opens in the browser rather than in here -- the
 * server already serves it sandboxed, and it needs no web view to do so.
 */
export function NoteScreen({ route }: Props) {
  const theme = useTheme();
  const t = useStrings();
  const { baseUrl } = useBackend();
  const { chave } = route.params;
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    getNote(baseUrl, chave).then(
      (note) => {
        if (!cancelled) setState({ status: "ready", note });
      },
      (err: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: err instanceof ApiError ? err.describe : (s) => s.errors.unexpected(String(err)),
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [baseUrl, chave, attempt]);

  if (state.status === "loading") {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} />
        <Text style={[styles.centerText, { color: theme.muted }]}>{t.notes.loading}</Text>
      </View>
    );
  }

  if (state.status === "error") {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <View style={[styles.errorBox, { backgroundColor: theme.errBg }]}>
          <Text style={[styles.errorText, { color: theme.errText }]}>{state.message(t)}</Text>
        </View>
        <Pressable
          onPress={() => setAttempt((n) => n + 1)}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.buttonText, { color: theme.accentText }]}>{t.notes.retry}</Text>
        </Pressable>
      </View>
    );
  }

  const { note } = state;
  const heading = [
    note.numero ? t.note.number(note.numero) : null,
    note.serie ? t.note.series(note.serie) : null,
    dateTime(note.emitted_at, t, { seconds: true }),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={styles.content}>
      <View style={styles.issuer}>
        <View style={styles.title}>
          <Text style={[styles.store, { color: theme.text }]} selectable>
            {note.emit_name ?? t.notes.unknownStore}
          </Text>
          {heading ? <Text style={[styles.heading, { color: theme.muted }]}>{heading}</Text> : null}
        </View>

        <Fields
          rows={[
            { label: t.note.cnpj, value: cnpj(note.emit_cnpj) },
            { label: t.note.address, value: note.emit_address, stacked: true },
            { label: t.note.uf, value: note.uf },
            { label: t.note.chave, value: chaveGroups(note.chave), stacked: true, mono: true },
            { label: t.note.qrUrl, value: note.source_url, stacked: true, mono: true },
          ]}
        />
      </View>

      <Section title={t.note.totals}>
        <Fields
          rows={[
            { label: t.note.totalItems, value: note.total_items },
            { label: t.note.totalValue, value: brl(note.total_value_c) },
            { label: t.note.discount, value: brl(note.discount_c) },
            { label: t.note.payable, value: brl(note.payable_c), strong: true },
            { label: t.note.paymentMethod, value: note.payment_method },
            { label: t.note.paid, value: brl(note.paid_c) },
            { label: t.note.taxes, value: brl(note.taxes_c) },
          ]}
        />
      </Section>

      <Section title={t.note.consumer}>
        <Fields
          rows={[
            { label: t.note.consumerCpf, value: cpf(note.consumer_cpf) },
            { label: t.note.consumerName, value: note.consumer_name },
          ]}
        />
      </Section>

      <Section
        title={t.note.items}
        aside={plural(note.items.length, t.units.line, t.units.lines)}
      >
        <Group>
          {note.items.map((item, index) => (
            <ItemRow key={item.n_item} item={item} first={index === 0} />
          ))}
        </Group>
      </Section>

      <Section title={t.note.collection}>
        <Fields
          rows={[
            { label: t.note.fetchedAt, value: instant(note.fetched_at, t) },
            { label: t.note.createdAt, value: instant(note.created_at, t) },
            { label: t.note.rawHtml, value: fileSize(note.raw_html_bytes) },
          ]}
        />
      </Section>

      <Section title={t.note.original}>
        <Text style={[styles.hint, { color: theme.muted }]}>{t.note.originalHint}</Text>
        <Pressable
          onPress={() => void Linking.openURL(noteHtmlUrl(baseUrl, note.chave))}
          accessibilityRole="link"
          style={({ pressed }) => [
            styles.outlineButton,
            { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <ExternalLink size={16} color={theme.accent} />
          <Text style={[styles.outlineButtonText, { color: theme.accent }]}>
            {t.note.openOriginal}
          </Text>
        </Pressable>
      </Section>
    </ScrollView>
  );
}

/** A labelled block, like one of the web page's panels. */
function Section({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  const theme = useTheme();

  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={[styles.sectionTitle, { color: theme.muted }]}>{title}</Text>
        {aside ? <Text style={[styles.sectionAside, { color: theme.muted }]}>{aside}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/** Rows on one card, the same group ChoiceList draws; each row but the first draws the hairline above it. */
function Group({ children }: { children: ReactNode }) {
  const theme = useTheme();

  return (
    <View style={[styles.group, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {children}
    </View>
  );
}

type Field = {
  label: string;
  value: string | number | null | undefined;
  /** Label above the value, for the ones too long to share a line with it. */
  stacked?: boolean;
  mono?: boolean;
  strong?: boolean;
};

const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

/**
 * A label and its value per row. The parser leaves what it could not read as
 * null, so an absent value is an em dash, as on the web page.
 */
function Fields({ rows }: { rows: Field[] }) {
  const theme = useTheme();

  return (
    <Group>
      {rows.map(({ label, value, stacked, mono, strong }, index) => {
        const absent = value === null || value === undefined || value === "";
        return (
          <View
            key={label}
            style={[
              styles.field,
              stacked && styles.fieldStacked,
              index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.fieldLabel, { color: theme.muted }]}>{label}</Text>
            <Text
              selectable={!absent}
              style={[
                styles.fieldValue,
                !stacked && styles.fieldValueInline,
                mono && { fontFamily: MONO, fontSize: 13 },
                strong && styles.strong,
                { color: absent ? theme.muted : theme.text },
              ]}
            >
              {absent ? "—" : String(value)}
            </Text>
          </View>
        );
      })}
    </Group>
  );
}

/** One line of the note: what, how much of it at what price, and what it came to. */
function ItemRow({ item, first }: { item: NoteItem; first: boolean }) {
  const theme = useTheme();
  const t = useStrings();

  const amount = [quantity(item.qty) ?? "—", item.unit].filter(Boolean).join(" ");
  const meta = [
    `${amount} × ${brl(item.unit_value_c) ?? "—"}`,
    item.store_code ? t.note.storeCode(item.store_code) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View
      style={[
        styles.item,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.border },
      ]}
    >
      <Text style={[styles.itemIndex, { color: theme.muted }]}>{item.n_item}</Text>
      <View style={styles.itemMain}>
        <Text style={[styles.itemDescription, { color: theme.text }]} selectable>
          {item.description}
        </Text>
        <Text style={[styles.itemMeta, { color: theme.muted }]}>{meta}</Text>
      </View>
      <Text style={[styles.itemTotal, { color: theme.text }]}>
        {brl(item.total_value_c) ?? "—"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, gap: 20 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  centerText: { fontSize: 14, lineHeight: 20, textAlign: "center" },
  errorBox: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12 },
  errorText: { fontSize: 13.5, lineHeight: 19, textAlign: "center" },
  button: { borderRadius: 8, paddingHorizontal: 20, paddingVertical: 12, minHeight: 44, justifyContent: "center" },
  buttonText: { fontSize: 15, fontWeight: "600" },

  issuer: { gap: 12 },
  title: { gap: 4, paddingHorizontal: 4 },
  store: { fontSize: 20, fontWeight: "700", letterSpacing: -0.3 },
  heading: { fontSize: 13.5 },

  section: { gap: 8 },
  sectionHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 4 },
  sectionTitle: { fontSize: 12.5, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 },
  sectionAside: { fontSize: 12.5 },
  hint: { fontSize: 13, lineHeight: 18, paddingHorizontal: 4 },

  group: { borderWidth: 1, borderRadius: 10, overflow: "hidden" },
  field: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  fieldStacked: { flexDirection: "column", alignItems: "stretch", gap: 3 },
  fieldLabel: { fontSize: 13.5 },
  fieldValue: { fontSize: 14.5, lineHeight: 20 },
  fieldValueInline: { flex: 1, textAlign: "right", fontVariant: ["tabular-nums"] },
  strong: { fontWeight: "700" },

  item: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  itemIndex: { width: 22, fontSize: 13, lineHeight: 20, fontVariant: ["tabular-nums"] },
  itemMain: { flex: 1, gap: 2 },
  itemDescription: { fontSize: 14.5, lineHeight: 20 },
  itemMeta: { fontSize: 12.5, lineHeight: 17, fontVariant: ["tabular-nums"] },
  itemTotal: { fontSize: 14.5, lineHeight: 20, fontWeight: "600", fontVariant: ["tabular-nums"] },

  outlineButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 46,
    paddingHorizontal: 16,
  },
  outlineButtonText: { fontSize: 15, fontWeight: "600" },
});
