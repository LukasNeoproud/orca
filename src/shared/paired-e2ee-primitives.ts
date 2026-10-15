// Why: desktop/CLI (Node), web and mobile each keep their own NaCl box and
// base64 adapters (size limits, Hermes typed-array quirks, no Buffer in a
// browser), so the shared handshake core takes them as a parameter.
export type PairedE2EEKeyPair = { publicKey: Uint8Array; secretKey: Uint8Array }

export type PairedE2EEV2KeySchedule = {
  mobileToDesktopKey: Uint8Array
  desktopToMobileKey: Uint8Array
  sessionId: Uint8Array
  transcriptHash: Uint8Array
}

export type PairedE2EEPrimitives = {
  generateKeyPair: () => PairedE2EEKeyPair
  deriveSharedKey: (ourSecretKey: Uint8Array, peerPublicKey: Uint8Array) => Uint8Array
  randomBytes: (length: number) => Uint8Array
  encodeBase64: (bytes: Uint8Array) => string
  // Throws on input the platform decoder rejects.
  decodeBase64: (value: string) => Uint8Array
  publicKeyFromBase64: (value: string) => Uint8Array
  publicKeyToBase64: (key: Uint8Array) => string
  sealLegacyText: (plaintext: string, sharedKey: Uint8Array) => string
  openLegacyText: (frame: string, sharedKey: Uint8Array) => string | null
  sealLegacyBinary: (plaintext: Uint8Array, sharedKey: Uint8Array) => Uint8Array<ArrayBuffer>
  openLegacyBinary: (frame: Uint8Array, sharedKey: Uint8Array) => Uint8Array | null
  // Throws on a corrupt stream. Absent where no synchronous inflater exists; such a client never
  // advertises E2EE_GZIP_PAYLOADS_CLIENT_CAPABILITY, so a host never compresses toward it.
  inflateGzip?: (gzip: Uint8Array) => Uint8Array
  // Why injected: Node uses node:crypto, so the CLI's unbundled runtime needs no extra package.
  deriveV2KeySchedule: (args: {
    sharedSecret: Uint8Array
    transcript: Uint8Array
    clientNonce: Uint8Array
    desktopNonce: Uint8Array
  }) => PairedE2EEV2KeySchedule
}
