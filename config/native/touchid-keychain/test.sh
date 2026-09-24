#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$SCRIPT_DIR/.build/module-cache"
/usr/bin/xcrun swiftc -swift-version 6 -parse-as-library \
    -module-cache-path "$SCRIPT_DIR/.build/module-cache" \
    "$SCRIPT_DIR/Sources/Core.swift" "$SCRIPT_DIR/Sources/Keychain.swift" \
    "$SCRIPT_DIR/Sources/MobileApproval.swift" "$SCRIPT_DIR/Tests/CoreTests.swift" \
    -framework Security -framework LocalAuthentication -framework CryptoKit \
    -o "$SCRIPT_DIR/.build/core-tests"
"$SCRIPT_DIR/.build/core-tests"
"$SCRIPT_DIR/build.sh"
"$SCRIPT_DIR/.build/touchid-keychain" --help >/dev/null
if "$SCRIPT_DIR/.build/touchid-keychain" get >/dev/null 2>&1; then
    printf 'FAIL: invalid CLI input returned success\n' >&2
    exit 1
fi
printf 'PASS: signed CLI starts and rejects invalid input without authentication\n'
