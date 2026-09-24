#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
fixtures=${1:-"$repo_root/config/scripts/emulator-video-toolbox-smoke/fixtures"}
build_dir=$(mktemp -d /private/tmp/orca-video-toolbox-smoke.XXXXXX)
trap 'rm -rf "$build_dir"' EXIT HUP INT TERM

CLANG_MODULE_CACHE_PATH="$build_dir/module-cache" \
SWIFT_MODULECACHE_PATH="$build_dir/module-cache" \
  xcrun swiftc \
    "$repo_root/mobile/packages/expo-emulator-video/ios/AV1ConfigurationRecord.swift" \
    "$repo_root/mobile/packages/expo-emulator-video/ios/EncodedVideoSample.swift" \
    "$repo_root/config/scripts/emulator-video-toolbox-smoke/main.swift" \
    -o "$build_dir/emulator-video-toolbox-smoke"
"$build_dir/emulator-video-toolbox-smoke" "$fixtures"
