# Mobile emulator host codec benchmark — before cadence fix

This is the original measurement before the JPEG and video frame schedulers were corrected. It is retained for regression evidence; use the companion report without the suffix for codec comparison at a matched 15 fps.

Run: 2026-09-24T18:19:13.790Z

Host: darwin 27.0.0, arm64; Apple M4 Pro; 48 GiB RAM; Electron 43.6.0, Chromium 150.0.7871.250.

Settings: 900×1600, 15 fps target, 2.5 Mbps video bit rate, JPEG quality 60; 8 seconds per phase, 3 trials per codec, 20 paced latency probes per trial.

| Codec | Scene     | Payload kB/s | Wire kB/s | Achieved fps | First frame ms | Feed→packet mean / p95 ms |
| ----- | --------- | -----------: | --------: | -----------: | -------------: | ------------------------: |
| JPEG  | static    |       1098.5 |    1099.3 |          7.5 |           10.5 |               14.2 / 17.4 |
| JPEG  | scrolling |       1094.1 |    1095.0 |          7.5 |           10.6 |               13.6 / 16.9 |
| H264  | static    |        163.0 |     163.4 |          8.3 |          216.6 |               35.7 / 41.9 |
| H264  | scrolling |        174.1 |     174.6 |          8.8 |          176.4 |               36.8 / 40.8 |
| HEVC  | static    |        153.6 |     154.0 |          8.4 |          177.7 |               37.0 / 41.5 |
| HEVC  | scrolling |        170.0 |     170.4 |          8.6 |          179.1 |               35.4 / 40.9 |
| AV1   | static    |        155.6 |     156.0 |          9.0 |          174.3 |               36.5 / 49.8 |
| AV1   | scrolling |        242.1 |     242.5 |          9.3 |          173.5 |               35.7 / 47.2 |

The scene is a generated phone-sized terminal/chat interface. Static repeats one source frame; scrolling cycles through 32 variants of text and log rows. Every codec receives the same pre-rendered JPEG input. Payload excludes framing; wire includes the production binary frame header and subscription ID. JPEG uses the production frame sender and nativeImage re-encoding; video uses the production hidden Electron WebCodecs encoder. Video startup includes hidden encoder window creation and first keyframe. Feed→packet probes are paced one at a time and include IPC, source JPEG decode, encode, and polling; they are not pure codec times.

Video uses a target bit rate while JPEG uses a fixed quality setting. Visual quality was not normalized or measured, so byte rates are not equal-quality comparisons. This host test does not measure phone decode latency, battery, network delay, or end-to-end touch response. Actual Android MediaCodec fixture tests are documented separately.

Reproduce from the repository root with `ORCA_BACKGROUND_LAUNCH=1 pnpm --dir mobile exec tsx ../config/scripts/run-emulator-codec-benchmark.ts`. It creates only hidden offscreen Electron windows and writes the raw JSON alongside this report.
