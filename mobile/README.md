# Orca Mobile

React Native companion app for Orca. Monitor worktrees, view terminal output, and send commands from your phone.

Local development uses two processes:

- Orca desktop/Electron from the repo root. This hosts the mobile WebSocket RPC server on port `6768`.
- Expo Metro from `mobile/`. This serves the React Native app on port `8081`.

Unless a command says otherwise, run mobile app commands from the `mobile/` directory.

## Prerequisites

- Node.js 24+
- pnpm
- Xcode and/or Android Studio tooling for simulator or device builds
- Expo Go on your phone, or a development client build when native modules are needed
- Phone and desktop on the same LAN when testing a physical phone

## Start Desktop Orca

From the repository root:

```bash
pnpm install
pnpm dev
```

Confirm the mobile RPC server is listening:

```bash
lsof -nP -iTCP:6768 -sTCP:LISTEN
```

Restart `pnpm dev` after changing Electron main-process code. Metro hot reload only applies to the mobile JavaScript bundle.

## Start The Mobile App

```bash
cd mobile
pnpm install
pnpm start
```

Scan the Expo QR code with your phone's camera on iOS, or Expo Go on Android.

For a native dev-client build:

```bash
pnpm exec expo run:android
pnpm exec expo run:ios
pnpm start --dev-client
```

## Pair With Desktop Orca

1. Open Orca desktop.
2. Go to Settings > Mobile.
3. Scan the pairing QR code from the mobile app.
4. Confirm the mobile host endpoint is `ws://<desktop-ip>:6768`.

For the Android emulator, use `ws://10.0.2.2:6768`. For a physical phone, use the desktop LAN IP, for example `ws://192.168.0.179:6768`.

If the phone has a stale host entry, remove it from the app and pair again.

## Development Paths

### Android Phone

1. Install Expo Go from Google Play
2. Run `pnpm start`, scan QR with Expo Go
3. For native modules: `pnpm exec expo run:android`
4. Run with `pnpm start --dev-client`

### iOS Simulator

1. Install Xcode from the App Store
2. Run `pnpm start --ios` to open in iOS Simulator

## Private Android Distribution

The `Mobile Android Private Distribution` workflow builds a separate Android app and sends it
only to a configured Firebase App Distribution tester group. It is manual-only: it does not create
a Git tag, GitHub Release, public artifact, Play Store upload, or upload to Orca's release project.

The private build overlays these Expo values without changing the public defaults in `app.json`:

- a distinct `android.package`, so it can be installed beside official Orca Mobile;
- launcher name `Orca Private` and URL scheme `orca-private` by default;
- a private `versionCode` derived as `base + workflow run number * 100 + run attempt`.

Expo maps `android.package` to the Android application ID and `android.versionCode` to the native
build version. Firebase requires the registered Android app to use that exact, case-sensitive
package. See the official [Expo app config reference](https://docs.expo.dev/versions/latest/config/app/)
and [Firebase CLI distribution guide](https://firebase.google.com/docs/app-distribution/android/distribute-cli).

### One-time private project setup

1. Pick a stable reverse-DNS package that differs from `com.stably.orca.mobile`, for example
   `dev.example.orca.privateapp`. Do not change it after distributing the first APK.
2. Create a private Firebase project, register an Android app with that exact package, enable App
   Distribution, and create a tester group. Record the Firebase Android App ID and group alias.
3. Create a dedicated service account with the `Firebase App Distribution Admin` role. Store its
   complete JSON key in the GitHub environment secret described below. Rotate it if repository or
   environment access changes.
4. Create one release keystore outside the repository and back it up securely. Every upgrade for
   this package must be signed by the same key. One suitable command is:

   ```bash
   keytool -genkeypair -v -storetype JKS -keystore "$HOME/orca-private-android.jks" \
     -alias orca-private -keyalg RSA -keysize 4096 -validity 10000
   ```

5. Create a protected GitHub environment named `private-mobile-distribution`. Add only the people
   allowed to publish private builds as reviewers, then configure:

| Kind     | Name                                     | Value                                                                                                                        |
| -------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Variable | `ORCA_PRIVATE_ANDROID_PACKAGE`           | The private Firebase Android app package                                                                                     |
| Variable | `ORCA_PRIVATE_ANDROID_VERSION_CODE_BASE` | A positive base, initially `1000000`; raise it above every previously distributed private build if workflow history is reset |
| Variable | `ORCA_PRIVATE_APP_NAME`                  | Optional launcher name, for example `Orca Private`                                                                           |
| Variable | `ORCA_PRIVATE_APP_SCHEME`                | Optional private scheme, for example `orca-private`                                                                          |
| Variable | `ORCA_PRIVATE_FIREBASE_APP_ID`           | Firebase Android App ID, such as `1:1234567890:android:abc123`                                                               |
| Variable | `ORCA_PRIVATE_FIREBASE_TESTER_GROUPS`    | One or more comma-separated Firebase tester group aliases                                                                    |
| Secret   | `ORCA_PRIVATE_FIREBASE_CREDENTIALS_JSON` | Complete service-account JSON                                                                                                |
| Secret   | `ORCA_PRIVATE_ANDROID_KEYSTORE_BASE64`   | Base64 of the stable keystore (`base64 < file` on macOS, `base64 -w0 file` on GNU/Linux)                                     |
| Secret   | `ORCA_PRIVATE_ANDROID_KEYSTORE_PASSWORD` | Keystore password                                                                                                            |
| Secret   | `ORCA_PRIVATE_ANDROID_KEY_ALIAS`         | Signing key alias                                                                                                            |
| Secret   | `ORCA_PRIVATE_ANDROID_KEY_PASSWORD`      | Signing key password                                                                                                         |

The workflow authenticates after the APK is built, and the Google authentication action removes
its temporary credentials file at job completion. Signing values are read from environment
variables by the generated Gradle project; they are never written into Expo config, Gradle source,
the APK artifact, or workflow output.

### Publish from CI

Run `Mobile Android Private Distribution` from GitHub Actions and optionally enter release notes.
The job verifies pairing and protocol contract tests, typechecks the mobile app, builds and verifies
the signed APK identity, then runs the pinned Firebase CLI against the configured tester groups.
The job summary returns Firebase's `testing_uri`. Only testers assigned to the release can use it.

Do not lower `ORCA_PRIVATE_ANDROID_VERSION_CODE_BASE` or reuse a package with a different signing
key. Android accepts an in-place update only when the package and signer match and `versionCode` is
higher than the installed build.

### Repeat the build locally

Keep the keystore and Firebase service-account file outside the checkout. Load passwords from a
password manager rather than placing them in a script or shell history, then run:

```bash
cd mobile
export ORCA_PRIVATE_ANDROID_RELEASE=1
export ORCA_PRIVATE_ANDROID_PACKAGE=dev.example.orca.privateapp
export ORCA_PRIVATE_ANDROID_VERSION_CODE=2000001 # must exceed the last private build
export ORCA_PRIVATE_APP_NAME='Orca Private'
export ORCA_PRIVATE_APP_SCHEME=orca-private
export ORCA_PRIVATE_ANDROID_SIGNING=true
export ORCA_PRIVATE_ANDROID_KEYSTORE_PATH=/secure/path/orca-private-android.jks
printf 'Keystore password: '; IFS= read -r -s ORCA_PRIVATE_ANDROID_KEYSTORE_PASSWORD; export ORCA_PRIVATE_ANDROID_KEYSTORE_PASSWORD; echo
export ORCA_PRIVATE_ANDROID_KEY_ALIAS=orca-private
printf 'Key password: '; IFS= read -r -s ORCA_PRIVATE_ANDROID_KEY_PASSWORD; export ORCA_PRIVATE_ANDROID_KEY_PASSWORD; echo

pnpm install --frozen-lockfile
pnpm test src/transport/protocol-compat.test.ts src/transport/pairing.test.ts src/transport/pair-confirm-state.test.ts
pnpm typecheck
pnpm exec expo prebuild --platform android --no-install
(cd android && ./gradlew --no-daemon assembleRelease)
```

Authenticate with an App Distribution Admin service account and upload to an explicit group:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/secure/path/firebase-app-distribution.json
npx --yes firebase-tools@15.30.2 appdistribution:distribute \
  android/app/build/outputs/apk/release/app-release.apk \
  --app 1:1234567890:android:abc123 \
  --groups trusted-testers \
  --release-notes 'Private Orca validation build'
```

The Firebase CLI prints `testing_uri` for testers, `firebase_console_uri` for project members, and a
one-hour `binary_download_uri`. Prefer `testing_uri`; tester authorization still applies and it does
not become a public release.

### Validate with Orca Dev

Install the Firebase release without removing official Orca Mobile, start an Orca Dev desktop
build, and pair by scanning its Settings > Mobile QR code inside `Orca Private`. Confirm the private
app can reconnect, list a worktree, open a session, and send terminal input. The CI protocol tests
protect the static pairing and compatibility contract; only this device check verifies LAN/relay,
Android permissions, the chosen signing identity, and the actual Orca Dev build together.

## Physical Phone Debugging

The phone can be inspected through the connected device tooling:

```bash
orca snapshot --json
orca click --element @e3 --json
orca fill --element @e1 --value "ls" --json
orca screenshot --json
```

Use `snapshot` first to find the current element refs, then click/fill those refs. After mobile file edits, Metro usually hot reloads automatically, but navigating out of and back into the session screen can be useful because it re-runs `terminal.subscribe`.

## Terminal Streaming Repro Without A Phone

Use this when terminal output does not render on device and you need to split server streaming bugs from WebView/UI bugs:

```bash
cd mobile
ORCA_MOBILE_WS_URL=ws://127.0.0.1:6768 pnpm exec tsx scripts/test-subscribe.ts <deviceToken> <serverPublicKeyB64>
```

You can pass a worktree selector as the third argument:

```bash
pnpm exec tsx scripts/test-subscribe.ts <deviceToken> <serverPublicKeyB64> "id:<worktreeId>"
pnpm exec tsx scripts/test-subscribe.ts <deviceToken> <serverPublicKeyB64> "path:/absolute/worktree/path"
pnpm exec tsx scripts/test-subscribe.ts <deviceToken> <serverPublicKeyB64> "name:my-worktree"
```

The expected result includes:

```text
streamSawMarker: true
readSawMarker: true
```

If this repro fails, debug the desktop runtime/PTY path before the mobile WebView. If it passes but the phone is blank, debug the session screen or `TerminalWebView` readiness/queueing path.

## Terminal Color Repro Without A Phone

Use this when terminal colors disappear after switching tabs. Open a Claude Code terminal and at least one other terminal in the target worktree, then run:

```bash
cd mobile
ORCA_MOBILE_WS_URL=ws://127.0.0.1:6768 pnpm exec tsx scripts/repro-terminal-colors.ts \
  <deviceToken> <serverPublicKeyB64> "id:<worktreeId>"
```

The script captures `terminal.subscribe` snapshots in an A → B → A sequence and writes raw snapshots to `mobile/terminal-color-repro/`. If the two A snapshots have different `sgrColor` counts, the desktop snapshot changed during the switch. If they match, the ANSI color data is still present and the bug is in mobile replay/rendering.

## Validation

Run these checks before committing mobile terminal changes:

```bash
cd mobile
pnpm exec tsc --noEmit
pnpm lint
cd ..
pnpm typecheck:node
```

## Protocol Version Compatibility

Mobile and desktop talk over a versioned protocol. Because mobile updates lag desktop by 24-48h via the App Store, both sides exchange version numbers on `status.get` so a genuinely incompatible combo can hard-block instead of silently misbehaving.

Constants live in two files (Metro can't resolve outside `mobile/`):

- `src/shared/protocol-version.ts` — `DESKTOP_PROTOCOL_VERSION`, `MIN_COMPATIBLE_MOBILE_VERSION`
- `mobile/src/transport/protocol-version.ts` — `MOBILE_PROTOCOL_VERSION`, `MIN_COMPATIBLE_DESKTOP_VERSION`

Today all four are set so `evaluateCompat` always returns `{ kind: 'ok' }` — nothing blocks. The wire format is in place to flip a switch when needed.

### When to bump

Bump `DESKTOP_PROTOCOL_VERSION` (and the mobile mirror `MOBILE_PROTOCOL_VERSION` when relevant) for **breaking** changes:

- Removed RPC method or required parameter that mobile uses
- Changed meaning (units, nullability) of an existing field mobile reads
- Changed encryption, framing, or auth handshake

Do **not** bump for additive changes:

- New RPC methods
- New optional fields on existing methods
- New event types in `terminal.subscribe`

Set `MIN_COMPATIBLE_MOBILE_VERSION` (kill-switch) when desktop ships a change that requires a minimum mobile version to function safely. Same for `MIN_COMPATIBLE_DESKTOP_VERSION` from the mobile side.

When a verdict is `blocked`, `mobile/src/components/ProtocolBlockScreen.tsx` renders a screen pointing the user at either the App Store (mobile too old) or GitHub Releases (desktop too old).

To exercise the block screen locally: set `MIN_COMPATIBLE_DESKTOP_VERSION = 999` in `mobile/src/transport/protocol-version.ts`, rebuild, pair to any desktop. Revert before merging.

## Mock Server

Develop the mobile app without a running Orca desktop instance:

```bash
pnpm mock-server           # starts mock WebSocket server on port 6768
```

Connect from the app using endpoint `ws://localhost:6768` and token `mock-device-token`.

### Environment variables

- `MOCK_NATIVE_CHAT=1` — serve the native-chat scenario (one live agent tab, empty transcript, image upload) instead of the default terminal fixtures.
- `MOCK_SERVER_KEY_FILE` — persist the server keypair across restarts so a paired device keeps its public-key pin. A missing or invalid file is re-keyed with a warning, which forces a re-pair.

### Scenario control files

Read on every request, so behaviour can be flipped mid-session without a restart (a restart would re-key E2EE and force a re-pair). Write the mode into the file, or delete it for the default.

- `MOCK_SEND_MODE_FILE` (default `orca-mock-send-mode` in the system temporary directory) — `accept` (default) accepts the send, `error` fails it with `mobile_input_floor_unavailable`, anything else reports the send as rejected.
- `MOCK_TERMINAL_LIST_MODE_FILE` (default `orca-mock-terminal-list-mode` in the system temporary directory) — `omit` returns an empty terminal list, `other` returns a list that omits the chat handle, anything else lists it.
- `MOCK_TERMINAL_STREAM_MODE_FILE` (default `orca-mock-terminal-stream-mode` in the system temporary directory) — `dead` answers a subscribe with `subscribed` then `end` (a gone PTY), which is what exercises the rearm bound and terminal prune; anything else streams normally.

## Connecting to Real Orca

1. Start Orca desktop with WebSocket transport enabled
2. In Orca, go to Settings > Mobile and scan the QR code with this app
3. The QR encodes the connection endpoint, device token, and TLS fingerprint

## Project Structure

```
mobile/
├── app/                   # Expo Router screens (file-based routing)
│   ├── _layout.tsx        # Root layout with navigation stack
│   ├── index.tsx          # Home screen — paired hosts list
│   └── pair-scan.tsx      # QR code scanning screen
├── src/
│   ├── terminal/          # Terminal WebView and xterm bridge
│   └── transport/         # WebSocket RPC client
├── scripts/
│   ├── test-subscribe.ts  # Desktop streaming repro without a phone
│   └── mock-server.ts     # Standalone mock WebSocket server
└── assets/                # App icons and splash screen
```
