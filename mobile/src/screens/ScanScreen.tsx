import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { BarcodeScanningResult } from "expo-camera";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { ApiError, ingestNote } from "../api";
import { useBackend } from "../backend";
import { ScreenHeader } from "../components/ScreenHeader";
import { brl, plural } from "../format";
import { useStrings } from "../i18n";
import type { Strings } from "../i18n";
import type { TabParamList } from "../navigation";
import { classifyScan } from "../scan";
import { useTheme } from "../theme";
import type { ParsedNote } from "../types";

type Outcome =
  | { kind: "added"; note: ParsedNote }
  | { kind: "rejected" }
  | { kind: "failed"; message: (t: Strings) => string };

/**
 * Point the camera at a note's QR code and it is ingested: the server fetches
 * the note from its state portal, parses it and stores it, and what came back
 * is shown as the confirmation. Reading the code is all this screen decides --
 * whether the code is a note at all is the backend's call.
 */
export function ScanScreen() {
  const theme = useTheme();
  const t = useStrings();
  const { baseUrl } = useBackend();
  const navigation = useNavigation<BottomTabNavigationProp<TabParamList, "Scan">>();
  const isFocused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  // The camera fires this repeatedly while a code is in frame, and state
  // updates are not immediate, so the guard has to be a ref: without it one
  // note is sent several times over.
  const scanning = useRef(false);

  const onScanned = useCallback(
    async ({ data }: BarcodeScanningResult) => {
      if (scanning.current) return;
      scanning.current = true;

      const payload = classifyScan(data);
      if (!payload) {
        setOutcome({ kind: "rejected" });
        return;
      }

      setBusy(true);
      try {
        const note = await ingestNote(baseUrl, payload);
        setOutcome({ kind: "added", note });
      } catch (err) {
        setOutcome({
          kind: "failed",
          // Kept as the failure, not as words: the language can change between
          // the scan and the moment this is read.
          message: err instanceof ApiError ? err.describe : (s: Strings) => s.errors.unexpected(String(err)),
        });
      } finally {
        setBusy(false);
      }
    },
    [baseUrl],
  );

  const scanAgain = () => {
    setOutcome(null);
    scanning.current = false;
  };

  return (
    <View style={[styles.flex, { backgroundColor: theme.bg }]}>
      <ScreenHeader title={t.scan.title} subtitle={t.scan.subtitle} />

      {!permission ? (
        // The permission state is still being read from the OS.
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : !permission.granted ? (
        <PermissionGate
          canAsk={permission.canAskAgain}
          onAsk={() => void requestPermission()}
        />
      ) : outcome ? (
        <OutcomeView
          outcome={outcome}
          onScanAgain={scanAgain}
          // To the list, even if a note was left open on Início.
          onSeeNotes={() => navigation.navigate("Home", { screen: "NoteList", pop: true })}
        />
      ) : (
        <View style={styles.flex}>
          {/* Mounted only while the tab is on screen: the camera should not stay
              live behind Início or Ajustes. */}
          {isFocused ? (
            <CameraView
              style={styles.flex}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={busy ? undefined : (result) => void onScanned(result)}
            />
          ) : (
            <View style={[styles.flex, { backgroundColor: theme.bg }]} />
          )}

          <View style={styles.overlay} pointerEvents="none">
            <View style={[styles.frame, { borderColor: busy ? theme.accent : "#ffffff" }]} />
            <View style={styles.caption}>
              <Text style={styles.captionText}>
                {busy ? t.scan.consulting : t.scan.pointAtCode}
              </Text>
              {busy ? <ActivityIndicator color="#ffffff" /> : null}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

/** Nothing can be scanned without the camera, so this is the whole screen until it is granted. */
function PermissionGate({ canAsk, onAsk }: { canAsk: boolean; onAsk: () => void }) {
  const theme = useTheme();
  const t = useStrings();

  return (
    <View style={styles.center}>
      <Text style={[styles.title, { color: theme.text }]}>{t.scan.permissionTitle}</Text>
      <Text style={[styles.body, { color: theme.muted }]}>
        {canAsk ? t.scan.permissionWhy : t.scan.permissionDenied}
      </Text>
      <Pressable
        onPress={canAsk ? onAsk : () => void Linking.openSettings()}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={[styles.buttonText, { color: theme.accentText }]}>
          {canAsk ? t.scan.allowCamera : t.scan.openSettings}
        </Text>
      </Pressable>
    </View>
  );
}

/** What the scan did, and the two ways on from it. */
function OutcomeView({
  outcome,
  onScanAgain,
  onSeeNotes,
}: {
  outcome: Outcome;
  onScanAgain: () => void;
  onSeeNotes: () => void;
}) {
  const theme = useTheme();
  const t = useStrings();

  return (
    <View style={styles.center}>
      {outcome.kind === "added" ? (
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.added, { color: theme.okText }]}>{t.scan.noteAdded}</Text>
          <Text style={[styles.store, { color: theme.text }]}>
            {outcome.note.emit_name ?? t.home.unknownStore}
          </Text>
          <Text style={[styles.body, { color: theme.muted }]}>
            {brl(outcome.note.payable_c ?? outcome.note.total_value_c) ?? t.scan.totalUnknown} ·{" "}
            {plural(outcome.note.items.length, t.units.item, t.units.items)}
          </Text>
        </View>
      ) : (
        <View style={[styles.errorBox, { backgroundColor: theme.errBg }]}>
          <Text style={[styles.errorText, { color: theme.errText }]}>
            {outcome.kind === "rejected" ? t.scan.notANote : outcome.message(t)}
          </Text>
        </View>
      )}

      <Pressable
        onPress={onScanAgain}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Text style={[styles.buttonText, { color: theme.accentText }]}>{t.scan.scanAnother}</Text>
      </Pressable>

      {outcome.kind === "added" ? (
        <Pressable onPress={onSeeNotes} accessibilityRole="button" hitSlop={8}>
          <Text style={[styles.linkText, { color: theme.accent }]}>{t.scan.seeNotes}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  frame: { width: 230, height: 230, borderWidth: 3, borderRadius: 16 },
  caption: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#000000b0", paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 },
  captionText: { color: "#ffffff", fontSize: 13.5, fontWeight: "600" },
  title: { fontSize: 17, fontWeight: "700" },
  body: { fontSize: 14, lineHeight: 20, textAlign: "center" },
  card: { borderWidth: 1, borderRadius: 12, padding: 18, gap: 4, alignItems: "center", alignSelf: "stretch" },
  added: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  store: { fontSize: 17, fontWeight: "600", textAlign: "center" },
  errorBox: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12 },
  errorText: { fontSize: 13.5, lineHeight: 19, textAlign: "center" },
  button: { borderRadius: 8, paddingHorizontal: 20, paddingVertical: 12, minHeight: 44, justifyContent: "center" },
  buttonText: { fontSize: 15, fontWeight: "600" },
  linkText: { fontSize: 14, fontWeight: "600" },
});
