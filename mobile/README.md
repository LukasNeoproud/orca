# Orca Mobile

React Native companion app for Orca. Monitor worktrees, view terminal output, and send commands from your phone.

Local development uses two processes:

- Orca desktop/Electron from the repo root. This hosts the mobile WebSocket RPC server on port `6768`.
- Expo Metro from `mobile/`. This serves the React Native app on port `8081`.

Unless a command says otherwise, run mobile app commands from the `mobile/` directory.

The Node commands `pnpm rpc:diff` and `pnpm rpc:record` use a development dependency linked to `../src/packages/process-host`. Mobile's install supplies the link, and `tsx` runs its source with the `orca-source` condition, so these command wrappers do not require a desktop install or package build. Keep that source directory in sparse checkouts. The recording suites still need root dependencies when they exercise desktop modules. The React Native app does not import this host package.

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

## View and control emulators

In a mobile workspace, tap **+** beside the tabs, then **Mobile Emulator** and select
an existing Android AVD or iOS simulator on the paired Orca host. A shut-down device
is booted on selection. Orca does not create devices or match their configuration
to your phone; configure the appropriate device in Android Studio or Xcode first.
Physical Android devices are excluded from this picker.

The emulator opens in a mobile tab with touch/drag, Home, Android Back, text input,
and a fullscreen toggle. Stream settings offer **Quality**, **Responsive** (default),
and **Save data**, changing resolution, bitrate and frame rate. **Video format** offers
Automatic, H.264, HEVC/H.265, AV1 and JPEG. The phone advertises its native decoder
support; the host tries encoders in preference order and echoes the selected format.
Unsupported encoders or failed phone decoders fall back to another format, then JPEG.
Automatic prefers H.264 for responsiveness and AV1/HEVC for quality or data saving.

Android uses a separate scrcpy encoder for each mobile subscription, leaving desktop
viewers untouched. iOS simulator JPEG frames are encoded on the host with WebCodecs
when supported. Compressed video is rendered by native MediaCodec/VideoToolbox views
on the phone. A new native mobile build is required; Expo Go or an older mobile binary
uses JPEG. AV1 availability depends on the device, particularly on iOS.

Streams use
the existing encrypted direct or relay connection; helper ports are not exposed to
the phone. Backgrounding or leaving the tab stops its stream and releases held touch
input without shutting down the emulator. Emulator tabs are local to the current
mobile workspace visit.

Both mobile and the paired Electron host need this feature. Node-only hosts do not
advertise streaming support. Devices belong to the paired host, including when the
workspace itself uses SSH; the mobile viewer does not silently start a device on an
SSH workspace host. iOS simulators require a macOS host with Xcode. Android uses the
host's configured Android SDK and the existing scrcpy backend.

Run the host codec smoke check without showing or focusing a window:

```sh
ORCA_BACKGROUND_LAUNCH=1 pnpm --dir mobile exec tsx ../config/scripts/run-mobile-emulator-codec-smoke.ts
```

It verifies that a single real-time H.264 keyframe becomes a JPEG through the actual
Electron decoder. Add `--all-codecs` to test the host's H.264, HEVC and AV1 encoders and
decoders with a keyframe, continuing frames and an orientation change. Set `ORCA_CODEC_FIXTURE_DIR` to a
temporary directory to save synthetic keyframes for native decoder tests. On macOS, run `config/scripts/run-emulator-video-toolbox-smoke.sh` to verify the actual
Swift bitstream parser and VideoToolbox decoding. The reproducible Android MediaCodec
check is documented in `config/scripts/android-emulator-codec-smoke/README.md`.
Phone touch interaction and complete Android/iOS device sessions
still require integration testing with configured devices.

Compare the production host encoding paths with synthetic terminal/chat content:

```sh
ORCA_BACKGROUND_LAUNCH=1 pnpm --dir mobile exec tsx ../config/scripts/run-emulator-codec-benchmark.ts
```

The report and raw measurements are saved under `config/scripts/emulator-codec-benchmark-results/`. They cover host
bandwidth, achieved frame rate, startup and feed-to-packet latency; they do not
measure equal visual quality, phone battery use or end-to-end network latency.

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

### Publish the Orca Dev app locally on macOS

The local publisher is fixed to Android package `cz.neoproud.orca.dev`, Firebase App ID
`1:100414786379:android:410ca57940be633c0676ce`, and service account
`orca-mobile-distribution@orca-dev-447f3.iam.gserviceaccount.com`. It reads secrets from the login
Keychain only at runtime through `$HOME/.local/bin/touchid-keychain`. The CI workflow remains
available separately.

Install Node.js 24, pnpm, JDK 17, and Android SDK command-line and build tools. Run
`pnpm install --frozen-lockfile` in `mobile/` once. The publisher also requires the executable
`$HOME/.local/bin/touchid-keychain`; run `touchid-keychain check` to confirm Touch ID is
available. Create a stable release keystore with alias `orca-dev` if one does not already exist;
keep a separate secure backup because every update of this package must use the same signing key.

Create five generic password items in Keychain Access. Select the login keychain, choose
**File > New Password Item**, set **Keychain Item Name** to the service below, set **Account Name**
to the listed account, and put the prepared value in **Password**.

| Keychain field                          | Exact value                                     |
| --------------------------------------- | ----------------------------------------------- |
| Service / Keychain Item Name            | `cz.neoproud.orca.dev.private-distribution`     |
| Account `android-keystore-base64`       | Stable keystore as single-line base64           |
| Account `android-keystore-password`     | Keystore password                               |
| Account `android-key-alias`             | Signing alias, normally `orca-dev`              |
| Account `android-key-password`          | Signing key password                            |
| Account `firebase-service-account-json` | Complete JSON key for the service account above |

Prepare file-backed values without printing them in the terminal by copying them directly to the
clipboard, pasting into Keychain Access, and clearing the clipboard afterward:

```bash
base64 < /secure/path/orca-dev.jks | tr -d '\n' | pbcopy
# Paste into android-keystore-base64, then:
pbcopy < /dev/null

pbcopy < /secure/path/orca-dev-firebase-service-account.json
# Paste into firebase-service-account-json, then:
pbcopy < /dev/null
```

After saving the JSON in Keychain, remove the downloaded JSON file according to the local secret
handling policy. Authorize the helper and verify the entire batch without displaying any value:

```bash
TOUCHID_KEYCHAIN=$HOME/.local/bin/touchid-keychain
SERVICE=cz.neoproud.orca.dev.private-distribution
"$TOUCHID_KEYCHAIN" verify \
  "$SERVICE" android-keystore-base64 \
  "$SERVICE" android-keystore-password \
  "$SERVICE" android-key-alias \
  "$SERVICE" android-key-password \
  "$SERVICE" firebase-service-account-json
```

Use this `verify` command once after creating or replacing the items and choose **Always Allow** for
the helper when macOS asks for Keychain access. It authenticates with Touch ID once and discards all
five values. By default, each later publisher run performs exactly one `get --json` batch, which
also requires one local Touch ID authentication. The helper has no authentication cache and returns no
partial batch if any item is missing or access is denied.

For an enrolled Orca Mobile device, add `--approval mobile`. This uses the vendored helper's
`get-mobile` command and a phone signature over the exact operation request. It requires a clean
committed worktree and must run in a local Orca terminal controlled from the paired phone.
Publishing through this route also requires explicit `--release-notes`, and
`--existing-apk` is not supported. The phone shows the mode, commit, app, tester groups, and a
release-note hash before biometric approval. The helper verifies the signature itself; an Orca
desktop approval status cannot release the Keychain values. See
`config/native/touchid-keychain/README.md` for enrollment and installation.
Start registration in Orca Desktop under Settings → Mobile → Device approvals, then
open Orca Mobile Settings → Device approvals and select the paired Mac.

The same helper also supports `get-mobile` for other Keychain service/account pairs. In that
case Orca Mobile shows every requested pair before approval and the helper returns values only
to the invoking process; see the helper README for command syntax.

The default command builds and verifies a signed APK but does not upload it:

```bash
cd mobile
node scripts/publish-private-android-local.mjs
```

Publishing requires both the explicit `--publish` flag and at least one Firebase tester group:

```bash
node scripts/publish-private-android-local.mjs \
  --publish \
  --groups orca-dev-private \
  --release-notes 'Private Orca validation build'
```

If the verified APK was built but a network error prevented upload, rerun the same command with
`--existing-apk`. The publisher checks its package, version code, and signing certificate again
before upload and rejects an APK whose version is no longer above Firebase history.

The script runs the mobile protocol tests and typecheck, regenerates `mobile/android`, builds the
signed release APK, and verifies its package, version code, APK signature, and signing certificate.
It uses `umask 077` for temporary keystore, certificate, release-note, and service-account files and
removes their temporary directory on success, failure, SIGINT, or SIGTERM. The upload uses pinned
`firebase-tools@15.30.2`; only the tester link is printed. If the CLI omits the link, the publisher
reads the confirmed release from Firebase App Distribution API. The publisher accepts the
Keychain batch only when it contains exactly the five configured service/account pairs with no
missing, duplicate, or extra records.

The next version code is one above both the Firebase release history and the last successful local
publish stored at `~/Library/Application Support/Orca/private-android-version-code`, with a floor of
`1000000`. The script checks Firebase again immediately before upload and refuses a stale version.
Use `--version-code <integer>` only to select a still-higher code. If CI distributes this same
package, keep `ORCA_PRIVATE_ANDROID_VERSION_CODE_BASE` high enough that the CI formula remains above
every already-distributed local build.

### Validate with Orca Dev

Install the Firebase release without removing official Orca Mobile, start an Orca Dev desktop
build, and pair by scanning its Settings > Mobile QR code inside `Orca Dev`. Confirm the private
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
pnpm run check:tests-typecheck
pnpm lint
cd ..
pnpm typecheck:node
```

`tsc --noEmit` reads `tsconfig.json`, which excludes test files so Metro never bundles them.
`tsconfig.test.json` puts them back, and `pnpm run typecheck:tests` shows their errors in full.
`check:tests-typecheck` is the gate over it: a ratchet against `tests-typecheck-baseline.txt`, the
127 test files that do not typecheck yet. It fails when a file that checks today stops checking,
and when a baseline entry starts checking (prune it with
`node scripts/check-tests-typecheck-ratchet.mjs --prune`). The list may only shrink.

The same gate censuses the program first: every `*.test.ts(x)` on disk must be in it, or named in
the script's `TESTS_OUTSIDE_PROGRAM` with a reason. Without that, a test excluded from
`tsconfig.test.json` — or a `Foo.test.tsx` shadowed by a `Foo.test.ts` beside it, which a wildcard
`include` drops for the higher-priority extension — would leave the ratchet silently.

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

When a verdict is `blocked`, `mobile/src/components/ProtocolBlockScreen.tsx` renders a screen pointing the user at the update that clears it. When mobile is too old it opens the newest release if the installed app's update check knows one, otherwise the App Store (iOS) or GitHub Releases (Android). When desktop is too old it opens GitHub Releases.

To exercise the block screen locally: set `MIN_COMPATIBLE_DESKTOP_VERSION = 999` in `mobile/src/transport/protocol-version.ts`, rebuild, pair to any desktop. Revert before merging.

## Mock Server

Develop the mobile app without a running Orca desktop instance:

```bash
pnpm mock-server           # starts mock WebSocket server on port 6768
```

Connect from the app using endpoint `ws://localhost:6768` and token `mock-device-token`.

### Environment variables

- `MOCK_NATIVE_CHAT=1` — serve the native-chat scenario (one live agent tab, empty transcript, image upload) instead of the default terminal fixtures.
- `MOCK_CHAT_AGENT=omp` — with `MOCK_NATIVE_CHAT=1`, present an OMP tab and four decoded transcript messages, including a tool call and result, instead of the default Claude scenario. It deliberately omits `transcriptPath` to exercise legacy-hook readability discovery; current OMP hooks may report a path.
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
