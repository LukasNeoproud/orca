# VideoToolbox codec smoke

Run on macOS with Xcode installed:

```sh
config/scripts/run-emulator-video-toolbox-smoke.sh
```

The runner compiles the app's actual `EncodedVideoSample.swift` and `AV1ConfigurationRecord.swift` with a command line test. It requests hardware decoding and BGRA output, decodes a keyframe, and checks its size and red center pixel. Build files and the Swift module cache stay in a temporary directory under `/private/tmp`.

`h264.bin`, `hevc.bin`, and `av1.bin` are 64×48 red keyframes from Orca's host WebCodecs encoder. Some Apple AV1 hardware reports AV1 support but rejects a 64×48 decoder session with VideoToolbox status `-12911`. On that specific result, the smoke verifies `av1-640x480.bin` and reports the tiny frame as skipped. This larger control is also a red AV1 low overhead OBU from Orca's actual host WebCodecs encoder (`run-mobile-emulator-codec-smoke.ts --all-codecs`, with `ORCA_CODEC_FIXTURE_DIR` set).

The test needs access to macOS IOSurface services. A restricted shell may make all VideoToolbox session creation fail with `-12911`, even when the host decoder works.
