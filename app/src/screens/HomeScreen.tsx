import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, listNotes } from "../api";
import { NoteRow } from "../components/NoteRow";
import { plural } from "../format";
import { useTheme } from "../theme";
import type { NoteSummary } from "../types";

type Props = {
  baseUrl: string;
  /** Sends the user back to onboarding — the saved server may have moved. */
  onChangeServer: () => void;
};

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; notes: NoteSummary[]; total: number };

/** Every note the backend has, newest emission first — the same order as the web list. */
export function HomeScreen({ baseUrl, onChangeServer }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<State>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (mode === "initial") setState({ status: "loading" });
      else setRefreshing(true);

      try {
        const data = await listNotes(baseUrl);
        setState({ status: "ready", notes: data.notes, total: data.total });
      } catch (err) {
        setState({
          status: "error",
          message: err instanceof ApiError ? err.message : `Falha inesperada: ${String(err)}`,
        });
      } finally {
        setRefreshing(false);
      }
    },
    [baseUrl],
  );

  useEffect(() => {
    void load("initial");
  }, [load]);

  const count = state.status === "ready" ? plural(state.total, "nota", "notas") : null;

  return (
    <View style={[styles.flex, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderColor: theme.border }]}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: theme.text }]}>Notas escaneadas</Text>
          <Text style={[styles.server, { color: theme.muted }]} numberOfLines={1}>
            {count ? `${count} · ` : ""}
            {baseUrl.replace(/^https?:\/\//, "")}
          </Text>
        </View>
        <Pressable
          onPress={onChangeServer}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.linkText, { color: theme.accent }]}>Servidor</Text>
        </Pressable>
      </View>

      {state.status === "loading" ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} />
          <Text style={[styles.centerText, { color: theme.muted }]}>Carregando…</Text>
        </View>
      ) : state.status === "error" ? (
        <View style={styles.center}>
          <View style={[styles.errorBox, { backgroundColor: theme.errBg }]}>
            <Text style={[styles.errorText, { color: theme.errText }]}>{state.message}</Text>
          </View>
          <Pressable
            onPress={() => void load("initial")}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.buttonText, { color: theme.accentText }]}>Tentar de novo</Text>
          </Pressable>
          <Pressable onPress={onChangeServer} accessibilityRole="button" hitSlop={8}>
            <Text style={[styles.linkText, { color: theme.accent }]}>Trocar de servidor</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={state.notes}
          keyExtractor={(note) => note.chave}
          renderItem={({ item }) => <NoteRow note={item} />}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 24 },
            state.notes.length === 0 && styles.flex,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor={theme.muted}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>Nenhuma nota ainda</Text>
              <Text style={[styles.centerText, { color: theme.muted }]}>
                Escaneie uma NFC-e pelo front end web do servidor e ela aparece aqui. Puxe para
                atualizar.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: { flex: 1, gap: 2 },
  title: { fontSize: 20, fontWeight: "700", letterSpacing: -0.3 },
  server: { fontSize: 12.5 },
  link: { paddingVertical: 4 },
  linkText: { fontSize: 14, fontWeight: "600" },
  list: { padding: 16, gap: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  centerText: { fontSize: 14, lineHeight: 20, textAlign: "center" },
  emptyTitle: { fontSize: 16, fontWeight: "600" },
  errorBox: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12 },
  errorText: { fontSize: 13.5, lineHeight: 19, textAlign: "center" },
  button: { borderRadius: 8, paddingHorizontal: 20, paddingVertical: 12, minHeight: 44, justifyContent: "center" },
  buttonText: { fontSize: 15, fontWeight: "600" },
});
