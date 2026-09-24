#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$SCRIPT_DIR/.build/module-cache"
# A fixed code-signing identifier, hardened runtime, and no entitlements.
# Ad-hoc signing requires no Apple account. Rebuilds may require ACL reapproval.
/usr/bin/xcrun swiftc -swift-version 6 -O -parse-as-library \
    -target "$(/usr/bin/uname -m)-apple-macosx13.0" \
    -module-cache-path "$SCRIPT_DIR/.build/module-cache" \
    "$SCRIPT_DIR/Sources/Core.swift" "$SCRIPT_DIR/Sources/Keychain.swift" \
    "$SCRIPT_DIR/Sources/MobileApproval.swift" "$SCRIPT_DIR/Sources/Main.swift" \
    -framework Security -framework LocalAuthentication -framework CryptoKit \
    -o "$SCRIPT_DIR/.build/touchid-keychain"
/usr/bin/codesign --force --sign "${TOUCHID_KEYCHAIN_SIGNING_IDENTITY:--}" \
    --identifier local.macos-tools.touchid-keychain --options runtime \
    "$SCRIPT_DIR/.build/touchid-keychain"
/usr/bin/codesign --verify --strict --verbose=2 "$SCRIPT_DIR/.build/touchid-keychain"
printf 'Built %s\n' "$SCRIPT_DIR/.build/touchid-keychain"
