# Device approval native module

Android 11 or newer only. `hostId` is an opaque ASCII identifier (1–128 characters from
`A–Z a–z 0–9 . _ : -`). Each host gets one P-256 Android Keystore signing key.

- `enroll(hostId, attestationChallengeBase64)` creates a new key. The challenge must be
  canonical base64 for 16–64 random server bytes. Existing keys are never replaced.
  The result contains the SPKI public key, the leaf-first DER certificate chain, and
  the local Keystore security level (`strongbox` or `trusted_environment`).
- `getPublicInfo(hostId)` returns the existing SPKI key and local security level.
- `sign(hostId, canonicalChallengeUtf8)` signs exactly the supplied UTF-8 bytes
  (1–16,384 bytes) with SHA-256/ECDSA after a strong biometric prompt. The result is
  a DER signature in base64. It does not sign an authentication boolean.
- `deleteKey(hostId)` removes the key if present.

The server must validate the attestation chain and extension, its challenge, the key
policy and public key, and the binding to the intended host. This module only returns
attestation evidence; its local security level is not remote verification. Enrollment
first attempts StrongBox and falls back to a TEE key. Software-backed keys fail closed.
Biometric enrollment changes invalidate the key, requiring a fresh enrollment.
