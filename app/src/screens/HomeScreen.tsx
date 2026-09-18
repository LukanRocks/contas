import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { ApiError, listNotes } from "../api";
import { useBackend } from "../backend";
import { NoteRow } from "../components/NoteRow";
import { ScreenHeader } from "../components/ScreenHeader";
import { hostLabel, plural } from "../format";
import type { TabParamList } from "../navigation";
import { useTheme } from "../theme";
import type { NoteSummary } from "../types";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; notes: NoteSummary[]; total: number };

/** Every note the backend has, newest emission first — the same order as the web list. */
export function HomeScreen() {
  const theme = useTheme();
  const { baseUrl } = useBackend();
  const navigation = useNavigation<BottomTabNavigationProp<TabParamList, "Home">>();
  const [state, setState] = useState<State>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" | "quiet") => {
      if (mode === "initial") setState({ status: "loading" });
      if (mode === "refresh") setRefreshing(true);

      try {
        const data = await listNotes(baseUrl);
        setState({ status: "ready", notes: data.notes, total: data.total });
      } catch (err) {
        // A quiet reload runs behind the user's back, so a blip should not
        // replace a good list with an error page. Pulling to refresh asks
        // again and reports what went wrong.
        if (mode === "quiet") return;
        setState({
          status: "error",
          message: err instanceof ApiError ? err.message : `Falha inesperada: ${String(err)}`,
        });
      } finally {
        if (mode === "refresh") setRefreshing(false);
      }
    },
    [baseUrl],
  );

  // Reloaded whenever the tab comes into focus, so a note just scanned on
  // Escanear is already here. Only the first visit to a given server shows the
  // spinner; after that the list reloads underneath what is on screen.
  const loadedFor = useRef<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      void load(loadedFor.current === baseUrl ? "quiet" : "initial");
      loadedFor.current = baseUrl;
    }, [load, baseUrl]),
  );

  const count = state.status === "ready" ? plural(state.total, "nota", "notas") : null;

  // `initial: false` keeps Ajustes underneath, so back lands there rather than
  // on an empty stack when the Settings tab has not been opened yet.
  const changeServer = () =>
    navigation.navigate("Settings", { screen: "Server", initial: false });

  return (
    <View style={[styles.flex, { backgroundColor: theme.bg }]}>
      <ScreenHeader
        title="Notas escaneadas"
        subtitle={`${count ? `${count} · ` : ""}${hostLabel(baseUrl)}`}
      />

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
          <Pressable onPress={changeServer} accessibilityRole="button" hitSlop={8}>
            <Text style={[styles.linkText, { color: theme.accent }]}>Trocar de servidor</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={state.notes}
          keyExtractor={(note) => note.chave}
          renderItem={({ item }) => <NoteRow note={item} />}
          contentContainerStyle={[styles.list, state.notes.length === 0 && styles.flex]}
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
                Escaneie o QR code de uma NFC-e na aba Escanear e ela aparece aqui.
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
  linkText: { fontSize: 14, fontWeight: "600" },
  list: { padding: 16, paddingBottom: 24, gap: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  centerText: { fontSize: 14, lineHeight: 20, textAlign: "center" },
  emptyTitle: { fontSize: 16, fontWeight: "600" },
  errorBox: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12 },
  errorText: { fontSize: 13.5, lineHeight: 19, textAlign: "center" },
  button: { borderRadius: 8, paddingHorizontal: 20, paddingVertical: 12, minHeight: 44, justifyContent: "center" },
  buttonText: { fontSize: 15, fontWeight: "600" },
});
