# touchid-keychain for Orca

This macOS helper reads existing generic passwords from the login Keychain. The
original `get` and `verify` commands require fresh local Touch ID on every
invocation. Orca's opt-in `get-mobile` command permits the fixed five-item
private Android distribution batch after a fresh signed approval from an
enrolled Orca Mobile device. The login Keychain keeps enforcing each item's
existing ACL; these commands do not add biometric access control to the items.

The source was copied from the user's local macos-tools/touchid-keychain
project; see PROVENANCE.md. It requires macOS 13+, enrolled Touch ID for local
commands and enrollment, and a Swift 6 toolchain to build.

## Build and install

```sh
./test.sh
./install.sh
$HOME/.local/bin/touchid-keychain --help
```

test.sh uses generated keys and fake values. It does not invoke Touch ID or
read real Keychain items. install.sh replaces the owner-only executable at
~/.local/bin/touchid-keychain with an ad-hoc signed build. It does not alter
stored credentials. A changed ad-hoc signature can require renewed Keychain
ACL approval for the five existing items. Run verify and approve the new
helper after reviewing the installed build; testing this source alone does not
install it. Do not install with sudo.

## Local Touch ID path

```sh
touchid-keychain get SERVICE ACCOUNT
touchid-keychain get --json SERVICE ACCOUNT [SERVICE ACCOUNT ...]
touchid-keychain get --null SERVICE ACCOUNT [SERVICE ACCOUNT ...]
touchid-keychain verify SERVICE ACCOUNT [SERVICE ACCOUNT ...]
touchid-keychain check
```

verify reads and discards; it is useful for initial Keychain ACL approval.
get emits only after authentication and all requested items are read. A denied
later item cannot leave a partial batch on stdout. check tests availability
without authenticating or accessing Keychain. Avoid logging get output.

## Mobile approval path

Install a new native Orca Mobile build containing the approval module first.
The initial build still uses local Touch ID or your existing CI credentials.
Then, from the repository root, run the enrollment ceremony:

```sh
pnpm --dir mobile exec tsx ../config/scripts/enroll-device-approval.ts
```

Open this Mac in Orca Mobile, select the shield button (Device approvals), and
register the phone. The local script checks Google's attestation chain and
revocation status, verified boot, hardware backing, and biometric-per-use
policy. Internet access is required; failed verification stops enrollment.
Compare the displayed fingerprints, enter the requested prefix on the Mac,
then confirm local Touch ID.

The helper's underlying administrative commands are:

```sh
touchid-keychain enroll-mobile P256_SPKI_DER_BASE64
touchid-keychain revoke-mobile
```

Both commands require local Touch ID. Enrollment's prompt includes the full
SHA-256 public-key fingerprint. The public key is pinned in the login Keychain
under the helper's ACL; enrolling a different key fails until the current key
is revoked. No desktop RPC can enroll, replace, or revoke it.
The raw enroll-mobile command accepts a public key; attestation is enforced by
the trusted local setup script, not by that administrative command. Use the
script above for enrollment. This design trusts local setup and the publisher.

For each mobile read, the helper creates a random 120-second challenge in
~/.config/orca/device-approvals/pending/. Orca transports its exact JSON
bytes to the enrolled phone. The phone shows the operation, requires biometric
authorization, and signs those bytes. The helper consumes the response from
responses/, verifies the DER P-256 ECDSA signature against the pinned key,
checks the deadline and five fixed service/account pairs, then reads Keychain.
An unsigned status or desktop RPC result is never accepted as authorization.
Timeout, invalid signature, absent key, and revocation fail without output.

The local publisher selects this route with --approval mobile. It requires a
clean committed worktree, explicit release notes when publishing, and rejects
--existing-apk. Clean HEAD rechecks catch ordinary source changes during the
operation; they do not prove that a concurrently modified build input produced
the APK. Operation details are supplied by the caller; the signature authorizes
credential release for that claim, not proof of the caller or resulting APK.
A returned secret remains accessible to the publisher process.
