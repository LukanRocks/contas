# @nf-price-tracker/app

The mobile client — one React Native codebase for iOS and Android, built with
[Expo](https://docs.expo.dev) (SDK 57). It talks to a `@nf-price-tracker/backend`
you host yourself, over the same `/api` the web front end uses.

## Running

```bash
cd app
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
opens straight on the notes. **Servidor** in the header returns to onboarding
when the backend moves.

**Home** — every scanned note from `GET /api/nfce`, newest emission first, same
order as the web list: establishment, emission date, item count, and what was
paid (`payable_c`, falling back to the items total). Pull to refresh.

Scanning a note is still the web front end's job; this app only reads.

## Layout

```
index.ts            Expo entry point
App.tsx             which screen to show, and the saved-URL bootstrap
app.json            Expo config: icons, bundle identifiers, network policy
src/
  api.ts            URL normalization, /api/health, /api/nfce
  storage.ts        the backend URL on the device
  format.ts         BRL, dates, chave -- pt-BR, no Intl (see below)
  theme.ts          light/dark palette, mirroring web/public/styles.css
  types.ts          the backend fields this app reads
  screens/          OnboardingScreen, HomeScreen
  components/       NoteRow
test/               format and URL normalization, under node --test
```

## Notes

- **Outside the pnpm workspace.** The root `pnpm-workspace.yaml` excludes
  `app`, so dependencies live in `app/pnpm-lock.yaml` and this folder has its
  own `pnpm-workspace.yaml` to stop pnpm walking up to the root one. The
  backend's Docker image installs the whole workspace with `--prod`; the React
  Native toolchain has no business in a server image, nor in every backend
  `pnpm install`. The cost is that root `pnpm test` and `pnpm typecheck` skip
  this package — run them here.
- **`node-linker=hoisted`** in `.npmrc`: Metro resolves modules by walking
  `node_modules` directories, and pnpm's default symlinked layout hides
  transitive React Native packages from it.
- **Plain HTTP is allowed**, because a self-hosted backend on a LAN usually
  has no certificate: Android gets `usesCleartextTraffic` through
  `expo-build-properties`, and iOS gets `NSAllowsLocalNetworking` plus a local
  network usage string. iOS will ask for permission the first time the app
  reaches a device on the local network.
- **No `Intl`.** Money and dates are formatted by hand. Hermes ships a trimmed
  ICU on Android, so `toLocaleString("pt-BR")` does not behave the same on both
  platforms.
- **Values arrive as integer cents** and are formatted for display only
  (`R$ 844,57`) — the same contract the web front end works to.
