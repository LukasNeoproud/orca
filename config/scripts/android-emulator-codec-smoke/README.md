# Android MediaCodec fixture smoke

This checks whether an existing Android emulator decodes Orca's H.264, HEVC, and AV1 keyframe bitstreams. It checks `MediaCodec` output dimensions and the red center pixel. It does not exercise the Expo video view, network transport, or touch input.

1. Generate fixtures by setting `ORCA_CODEC_FIXTURE_DIR` to a temporary directory and running `pnpm exec tsx config/scripts/run-mobile-emulator-codec-smoke.ts --all-codecs` from the repo root. On PowerShell, set the variable with `$env:ORCA_CODEC_FIXTURE_DIR = 'C:\temp\orca-codec-fixtures'`; on macOS/Linux, use `export ORCA_CODEC_FIXTURE_DIR=/tmp/orca-codec-fixtures`. The command writes `h264.bin`, `hevc.bin`, and `av1.bin` for codecs available on the host.
2. Compile `CodecSmoke.java` with `javac -source 8 -target 8 -cp <SDK>/platforms/android-35/android.jar -d <BUILD> CodecSmoke.java`. Package `<BUILD>/CodecSmoke.class` with `<SDK>/build-tools/35.0.1/d8 --lib <SDK>/platforms/android-35/android.jar --min-api 34 --output <BUILD>/codec-smoke.jar <BUILD>/CodecSmoke.class`. Replace `<SDK>` and `<BUILD>` with local paths; use the platform's path separator on Windows.
3. Start an **existing** AVD if needed: `<SDK>/emulator/emulator -avd <AVD_NAME> -no-window -no-audio -no-snapshot-save -no-boot-anim`. Record its adb serial from `adb devices`; use that serial in every following command. Do not stop an emulator that was already running.
4. Run `adb -s <SERIAL> shell mkdir -p /data/local/tmp/orca-codec-smoke`, then `adb -s <SERIAL> push <BUILD>/codec-smoke.jar <FIXTURES>/h264.bin <FIXTURES>/hevc.bin <FIXTURES>/av1.bin /data/local/tmp/orca-codec-smoke/`.
5. For each codec (`h264`, `hevc`, `av1`), run `adb -s <SERIAL> shell "CLASSPATH=/data/local/tmp/orca-codec-smoke/codec-smoke.jar app_process / CodecSmoke <CODEC> /data/local/tmp/orca-codec-smoke/<CODEC>.bin"`. A pass prints decoder name, `size=64x48`, and a red `rgb` sample.
6. Remove test files with `adb -s <SERIAL> shell rm -r /data/local/tmp/orca-codec-smoke`. If you started the AVD for this test, stop only that serial with `adb -s <SERIAL> emu kill`.

On 2026-09-24, the headless `Pixel_9_API_35_Android_15` AVD passed all three: `c2.goldfish.h264.decoder`, `c2.android.hevc.decoder`, and `c2.android.av1-dav1d.decoder`, each producing a 64×48 image with center RGB approximately `210,31,35`.
