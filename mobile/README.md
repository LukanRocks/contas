# @nf-price-tracker/mobile

The mobile client — one React Native codebase for iOS and Android, built with
[Expo](https://docs.expo.dev) (SDK 57). It talks to a `@nf-price-tracker/backend`
you host yourself, over the same `/api` the web front end uses.

## Running

```bash
cd mobile
pnpm install
pnpm start        # Metro; press i / a, or scan the QR code with Expo Go
```

```bash
pnpm test         # pure helpers, under node --test
pnpm typecheck
```

The phone and the backend have to be on the same network — Expo Go loads the
JS bundle from this machine, and the app then calls your server directly.

Building installable binaries is out of scope here: that is
[EAS Build](https://docs.expo.dev/build/introduction/) (`npx eas build -p ios`),
or `npx expo prebuild` if you would rather drive Xcode and Gradle yourself. Both
generate `ios/` and `android/` folders, which are git-ignored on purpose.

## What it does

**First launch** — onboarding asks for the backend's address. It accepts what
you would actually type (`192.168.1.10:3000`, `nf.local`,
`https://nf.example.com/api/`) and fills in the rest: a missing scheme becomes
`http://` for an address on your own network and `https://` otherwise, a
trailing `/api` is dropped. `GET /api/health` then has to answer `{"status":
"ok"}` before anything is stored, so a typo, an unreachable host, an unhealthy
database and a server that is not this one are all told apart at setup instead
of at first use.

**Every launch after** — the address is read back from the device and the app
opens straight on the notes. From there a tab bar switches between **Escanear**,
**Início** and **Ajustes**.

**Escanear** — the camera, reading QR codes. A note's code is handed to
`POST /api/nfce`, which fetches the note from its state portal, parses it and
stores it; the parsed note comes back and is shown as the confirmation, with
**Escanear outra** for the next receipt of the trip. Whether a code is a note
at all stays the backend's call — the app only turns down what it can see is
not one (a wifi code, a vCard), so nothing pointless leaves the phone and
nothing the server would have accepted is refused here. The write is idempotent
on the chave, so rescanning a note updates the stored copy instead of
duplicating it. The camera is mounted only while the tab is on screen.

**Início** — every scanned note from `GET /api/nfce`, newest emission first,
same order as the web list: establishment, emission date, item count, and what
was paid (`payable_c`, falling back to the items total). Pull to refresh; the
list also reloads whenever the tab comes into focus, so a note just scanned is
already there. That reload is quiet — a failed one leaves the list as it was
rather than replacing it with an error, which pulling to refresh would report.

**Ajustes › Aparência** — Claro or Escuro, or **Do aparelho**, the default:
the palette follows the phone's light/dark setting, live. Picking one pins it.

**Ajustes › Idioma** — Portuguese or English, or **Do aparelho**, which is the
default: the device's preferred languages are walked in order and the first one
the app speaks wins, English if it speaks neither. Picking a language pins it;
leaving it on the device setting means a phone switched to English later carries
the app with it, live.

**Ajustes › Servidor** — names the server (it is "Servidor" until you do;
clearing the name goes back to that) and changes the backend when it moves.
Same form and the same `/api/health` check as onboarding, run only when the
address actually changes — renaming works with the server down. The saved
address stays in force until a new one answers, so backing out leaves the app
as it was.

## Layout

```
index.ts            Expo entry point
App.tsx             the saved-URL bootstrap, then onboarding or the tab bar
app.json            Expo config: icons, bundle identifiers, network policy
src/
  api.ts            URL normalization, /api/health, /api/nfce
  backend.ts        the saved server, as a context for navigator screens
  navigation.ts     route names and params for the tabs and the Ajustes stack
  scan.ts           what a scanned QR code means to the ingest endpoint
  i18n/
    strings.ts      every word, in pt and en, behind one type
    language.ts     which language to render in
    index.ts        the context the screens read it through
  storage.ts        the server, the language and the palette, on the device
  format.ts         BRL, dates, chave -- pt-BR, no Intl (see below)
  theme/
    palette.ts      the light and dark colours, shared with the web front end
    scheme.ts       which of the two to render in
    index.ts        the context the components read it through
  types.ts          the backend fields this app reads
  screens/          OnboardingScreen, ScanScreen, HomeScreen, SettingsScreen,
                    ServerScreen, LanguageScreen, ThemeScreen
  components/       NoteRow, ServerForm, ScreenHeader, ChoiceList
locales/            the iOS permission strings, per language
test/               format, URL normalization, QR classification, language and
                    palette resolution, under node --test
```

## Notes

- **Its own project.** This folder sits beside `../container` rather than
  inside its pnpm workspace, with its own `pnpm-lock.yaml`. The server image
  installs that whole workspace with `--prod`, and the React Native toolchain
  has no business in a server image, nor in every backend `pnpm install`. CI
  runs `pnpm typecheck` and `pnpm test` here through
  `.github/workflows/mobile.yml`.
- **`node-linker=hoisted`** in `.npmrc`: Metro resolves modules by walking
  `node_modules` directories, and pnpm's default symlinked layout hides
  transitive React Native packages from it.
- **Plain HTTP is allowed**, because a self-hosted backend on a LAN usually
  has no certificate: Android gets `usesCleartextTraffic` through
  `expo-build-properties`, and iOS gets `NSAllowsLocalNetworking` plus a local
  network usage string. iOS will ask for permission the first time the app
  reaches a device on the local network.
- **The camera** is `expo-camera`, configured through its plugin with a pt-BR
  permission string and `recordAudioAndroid: false` — scanning a QR code has no
  use for a microphone, and without that the Android build would ask for one.
  Permission is requested on the Escanear tab itself, which also offers the
  system settings once it has been denied.
- **Ingesting gets its own timeout** (45s, against 10s for a read): the server
  is not answering from its own database, it is fetching the note from a state
  portal first.
- **The strings are a type, not a file format.** `Strings` in
  `src/i18n/strings.ts` describes every label, and both bundles are declared as
  it — so a missing string, or one whose interpolation changed, is a typecheck
  failure rather than a blank label found on a phone. Nothing is loaded at
  runtime and there is no i18n dependency.
- **The palette and the language are the same shape.** A stored setting of
  "system", "pt"/"en" or "light"/"dark"; a pure `resolve*` that turns it plus
  what the device says into what to render; a context above the whole app so a
  pinned choice beats the device everywhere. `useTheme()` reads that context
  rather than `useColorScheme()`, which is why every component kept working
  unchanged when the setting arrived.
- **Failures carry how to say themselves, not the words.** `ApiError` holds a
  `describe(t)` rather than a message, because the language can change between
  the throw and the moment it is read. `api.ts` therefore holds no words at all.
- **Money is not translated.** `R$ 844,57` is an amount on a Brazilian fiscal
  document, not a rendering preference, so it reads the same in both languages.
  Dates are translated, because `02/09` and `09/02` are the same characters and
  different days: English names the month (`2 Sep 2026`). Times stay 24-hour.
- **The iOS permission dialogs** are localized too, through `expo.locales` in
  `app.json` and `locales/*.json`. The `Info.plist` values in `app.json` are the
  English fallback for a device in neither language.
- **No `Intl`.** Money and dates are formatted by hand. Hermes ships a trimmed
  ICU on Android, so `toLocaleString("pt-BR")` does not behave the same on both
  platforms.
- **Values arrive as integer cents** and are formatted for display only
  (`R$ 844,57`) — the same contract the web front end works to.
