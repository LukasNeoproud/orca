# Mobile emulator host codec benchmark

Run: 2026-09-24T18:25:43.909Z

Host: darwin 27.0.0, arm64; Apple M4 Pro; 48 GiB RAM; Electron 43.6.0, Chromium 150.0.7871.250.

Settings: 900×1600, 15 fps target, 2.5 Mbps video bit rate, JPEG quality 60; 8 seconds per phase, 3 trials per codec, 20 paced latency probes per trial.

| Codec | Scene     | Payload kB/s | Wire kB/s | Achieved fps | First frame ms | Feed→packet mean / p95 ms |
| ----- | --------- | -----------: | --------: | -----------: | -------------: | ------------------------: |
| JPEG  | static    |       2196.9 |    2198.7 |         15.0 |           10.4 |               14.2 / 17.0 |
| JPEG  | scrolling |       2189.8 |    2191.6 |         15.0 |           10.4 |               14.8 / 18.0 |
| H264  | static    |        277.1 |     277.9 |         15.0 |          218.6 |               38.5 / 41.9 |
| H264  | scrolling |        295.9 |     296.6 |         15.0 |          175.8 |               37.6 / 41.1 |
| HEVC  | static    |        203.7 |     204.4 |         15.0 |          179.1 |               38.5 / 42.0 |
| HEVC  | scrolling |        291.1 |     291.8 |         15.0 |          178.3 |               38.9 / 41.4 |
| AV1   | static    |        192.5 |     193.2 |         15.0 |          172.8 |               36.6 / 49.6 |
| AV1   | scrolling |        363.9 |     364.6 |         15.0 |          172.5 |               37.2 / 50.3 |

The scene is a generated phone-sized terminal/chat interface. Static repeats one source frame; scrolling cycles through 32 variants of text and log rows. Every codec receives the same pre-rendered JPEG input. Payload excludes framing; wire includes the production binary frame header and subscription ID. JPEG uses the production frame sender and nativeImage re-encoding; video uses the production hidden Electron WebCodecs encoder. Video startup includes hidden encoder window creation and first keyframe. Feed→packet probes are paced one at a time and include IPC, source JPEG decode, encode, and polling; they are not pure codec times.

Video uses a target bit rate while JPEG uses a fixed quality setting. Visual quality was not normalized or measured, so byte rates are not equal-quality comparisons. This host test does not measure phone decode latency, battery, network delay, or end-to-end touch response. Actual Android MediaCodec fixture tests are documented separately.

Reproduce from the repository root with `ORCA_BACKGROUND_LAUNCH=1 pnpm --dir mobile exec tsx ../config/scripts/run-emulator-codec-benchmark.ts`. It creates only hidden offscreen Electron windows and writes the raw JSON alongside this report.
