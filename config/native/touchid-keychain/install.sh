#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${TOUCHID_KEYCHAIN_INSTALL_DIR:-$HOME/.local/bin}"
"$SCRIPT_DIR/build.sh"
mkdir -p "$INSTALL_DIR"
if [[ -L "$INSTALL_DIR" || ! -O "$INSTALL_DIR" ]]; then
    printf 'Install directory must be owned by you and must not be a symlink: %s\n' "$INSTALL_DIR" >&2
    exit 1
fi
INSTALL_MODE="$(/usr/bin/stat -f '%Lp' "$INSTALL_DIR")"
if (( (8#$INSTALL_MODE & 0022) != 0 )); then
    printf 'Install directory must not be writable by group or others: %s\n' "$INSTALL_DIR" >&2
    exit 1
fi
if [[ -e "$INSTALL_DIR/touchid-keychain" || -L "$INSTALL_DIR/touchid-keychain" ]]; then
    if [[ -L "$INSTALL_DIR/touchid-keychain" || ! -f "$INSTALL_DIR/touchid-keychain" || ! -O "$INSTALL_DIR/touchid-keychain" ]]; then
        printf 'Refusing to replace a symlink, non-file, or file owned by another user.\n' >&2
        exit 1
    fi
fi
# Install a real executable, not a symlink into mutable build output. Atomic
# replacement also avoids modifying a signed executable that is running.
INSTALL_TEMP="$(mktemp "$INSTALL_DIR/.touchid-keychain.XXXXXX")"
trap 'rm -f "$INSTALL_TEMP"' EXIT
/usr/bin/install -m 700 "$SCRIPT_DIR/.build/touchid-keychain" "$INSTALL_TEMP"
/usr/bin/codesign --verify --strict "$INSTALL_TEMP"
mv -f "$INSTALL_TEMP" "$INSTALL_DIR/touchid-keychain"
/usr/bin/codesign --verify --strict "$INSTALL_DIR/touchid-keychain"
printf 'Installed %s\n' "$INSTALL_DIR/touchid-keychain"
printf 'After updates, macOS may ask you to approve Keychain access again.\n'
