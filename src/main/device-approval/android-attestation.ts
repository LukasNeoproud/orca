import { createHash, timingSafeEqual, X509Certificate } from 'node:crypto'

import {
  children,
  derBytes,
  derNumber,
  derOid,
  derRoot,
  expectDer,
  onlyChild,
  type DerNode
} from './android-attestation-der'
import { verifyAndroidAttestationChain } from './android-attestation-chain'
import { GOOGLE_ANDROID_ATTESTATION_ROOTS } from './android-attestation-roots'
import { officialAndroidAttestationRevocation } from './android-attestation-revocation'

const ATTESTATION_OID = '1.3.6.1.4.1.11129.2.1.17'
const MAX_CERTIFICATE_BYTES = 32 * 1024

export type AndroidApprovalAttestationOptions = {
  certificateChainBase64: string[]
  challengeBase64: string
  publicKeySpkiBase64: string
  now?: Date
  trustRoots?: readonly string[]
  revocation?: (serialNumbersHex: readonly string[]) => Promise<boolean>
}

export type AndroidApprovalAttestation = {
  hardwareBacked: true
  securityLevel: 'tee' | 'strongbox'
  verifiedBoot: true
  biometricPerUse: true
  leafCertificateFingerprintSha256: string
}

export class AndroidAttestationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AndroidAttestationError'
  }
}

function reject(message: string): never {
  throw new AndroidAttestationError(message)
}

function decodeBase64(value: string, maxBytes: number): Buffer {
  if (
    typeof value !== 'string' ||
    value.length > Math.ceil(maxBytes / 3) * 4 + 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    reject('Malformed attestation base64')
  }
  const decoded = Buffer.from(value, 'base64')
  if (decoded.length > maxBytes || decoded.toString('base64') !== value) {
    reject('Malformed attestation base64')
  }
  return decoded
}

function certificateExtension(certificate: X509Certificate): Buffer | undefined {
  const certificateFields = children(derRoot(certificate.raw))
  if (certificateFields.length !== 3) {
    reject('Malformed attestation certificate')
  }
  const tbs = certificateFields[0]!
  expectDer(tbs, 16, 0, true)
  const extensions = children(tbs).filter((field) => field.tagClass === 2 && field.tag === 3)
  if (extensions.length > 1) {
    reject('Duplicate certificate extension list')
  }
  if (extensions.length === 0) {
    return undefined
  }
  const list = onlyChild(extensions[0]!)
  expectDer(list, 16, 0, true)
  let attestation: Buffer | undefined
  for (const entry of children(list)) {
    expectDer(entry, 16, 0, true)
    const fields = children(entry)
    if (fields.length !== 2 && fields.length !== 3) {
      reject('Malformed certificate extension')
    }
    const oid = derOid(fields[0]!)
    if (fields.length === 3) {
      expectDer(fields[1]!, 1)
      const critical = derBytes(fields[1]!)
      if (critical.length !== 1 || critical[0] !== 0xff) {
        reject('Malformed extension criticality')
      }
    }
    const value = fields.at(-1)!
    expectDer(value, 4)
    if (oid === ATTESTATION_OID) {
      if (attestation) {
        reject('Duplicate Android attestation extension')
      }
      attestation = derBytes(value)
    }
  }
  return attestation
}

function authorizationList(node: DerNode): Map<number, DerNode> {
  expectDer(node, 16, 0, true)
  const tags = new Map<number, DerNode>()
  for (const field of children(node)) {
    if (field.tagClass !== 2 || !field.constructed || tags.has(field.tag)) {
      reject('Malformed attestation authorization list')
    }
    tags.set(field.tag, onlyChild(field))
  }
  return tags
}

function requiredNumber(tags: Map<number, DerNode>, tag: number): number {
  const node = tags.get(tag)
  if (!node) {
    reject(`Missing hardware authorization ${tag}`)
  }
  return derNumber(node)
}

function numberSet(tags: Map<number, DerNode>, tag: number): number[] {
  const node = tags.get(tag)
  if (!node) {
    reject(`Missing hardware authorization ${tag}`)
  }
  expectDer(node, 17, 0, true)
  const values = children(node).map((item) => derNumber(item))
  if (values.length === 0 || new Set(values).size !== values.length) {
    reject('Malformed authorization set')
  }
  return values
}

function verifyKeyDescription(data: Buffer, challenge: Buffer): 'tee' | 'strongbox' {
  if (data.length > 16 * 1024) {
    reject('Oversized Android attestation extension')
  }
  const root = derRoot(data)
  expectDer(root, 16, 0, true)
  const fields = children(root)
  if (fields.length !== 8) {
    reject('Malformed Android key description')
  }
  derNumber(fields[0]!)
  const attestationLevel = derNumber(fields[1]!, 10)
  derNumber(fields[2]!)
  const keyMintLevel = derNumber(fields[3]!, 10)
  if ((attestationLevel !== 1 && attestationLevel !== 2) || keyMintLevel !== attestationLevel) {
    reject('Key attestation is not hardware backed')
  }
  expectDer(fields[4]!, 4)
  const attestedChallenge = derBytes(fields[4]!)
  if (
    attestedChallenge.length !== challenge.length ||
    !timingSafeEqual(attestedChallenge, challenge)
  ) {
    reject('Android attestation challenge mismatch')
  }
  expectDer(fields[5]!, 4)
  const software = authorizationList(fields[6]!)
  const hardware = authorizationList(fields[7]!)
  if (software.has(503) || hardware.has(503)) {
    reject('Approval key does not require authentication')
  }
  const purposes = numberSet(hardware, 1)
  const digests = numberSet(hardware, 5)
  if (
    purposes.length !== 1 ||
    purposes[0] !== 2 ||
    requiredNumber(hardware, 2) !== 3 ||
    requiredNumber(hardware, 3) !== 256 ||
    requiredNumber(hardware, 10) !== 1 ||
    digests.length !== 1 ||
    digests[0] !== 4
  ) {
    reject('Approval key is not restricted to P-256 SHA-256 signing')
  }
  if (
    requiredNumber(hardware, 504) !== 2 ||
    (hardware.has(505) && requiredNumber(hardware, 505) !== 0) ||
    software.has(504) ||
    software.has(505)
  ) {
    reject('Approval key is not hardware biometric per-use')
  }
  if (requiredNumber(hardware, 702) !== 0) {
    reject('Approval key was not generated in hardware')
  }
  const boot = hardware.get(704)
  if (!boot) {
    reject('Missing hardware verified boot state')
  }
  expectDer(boot, 16, 0, true)
  const bootFields = children(boot)
  if (bootFields.length !== 3 && bootFields.length !== 4) {
    reject('Malformed verified boot state')
  }
  expectDer(bootFields[0]!, 4)
  expectDer(bootFields[1]!, 1)
  const locked = derBytes(bootFields[1]!)
  if (locked.length !== 1 || locked[0] !== 0xff || derNumber(bootFields[2]!, 10) !== 0) {
    reject('Device is not locked with verified boot')
  }
  if (bootFields[3]) {
    expectDer(bootFields[3], 4)
  }
  return attestationLevel === 2 ? 'strongbox' : 'tee'
}

export async function validateAndroidApprovalAttestation(
  options: AndroidApprovalAttestationOptions
): Promise<AndroidApprovalAttestation> {
  try {
    const { certificateChainBase64, challengeBase64, publicKeySpkiBase64 } = options
    if (
      !Array.isArray(certificateChainBase64) ||
      certificateChainBase64.length < 2 ||
      certificateChainBase64.length > 8
    ) {
      reject('Invalid Android attestation chain length')
    }
    const challenge = decodeBase64(challengeBase64, 128)
    if (challenge.length < 16) {
      reject('Android attestation challenge is too short')
    }
    const expectedSpki = decodeBase64(publicKeySpkiBase64, 1024)
    const chain = certificateChainBase64.map(
      (base64) => new X509Certificate(decodeBase64(base64, MAX_CERTIFICATE_BYTES))
    )
    const now = options.now?.getTime() ?? Date.now()
    if (!Number.isFinite(now)) {
      reject('Invalid attestation verification time')
    }
    verifyAndroidAttestationChain(
      chain,
      options.trustRoots ?? GOOGLE_ANDROID_ATTESTATION_ROOTS,
      now
    )
    const leaf = chain[0]!
    const spki = leaf.publicKey.export({ type: 'spki', format: 'der' })
    if (
      spki.length !== expectedSpki.length ||
      !timingSafeEqual(spki, expectedSpki) ||
      leaf.publicKey.asymmetricKeyType !== 'ec' ||
      leaf.publicKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1'
    ) {
      reject('Android attestation key does not match the P-256 approval key')
    }
    const extensions = chain.map(certificateExtension)
    if (!extensions[0] || extensions.slice(1).some(Boolean)) {
      reject('Android attestation extension is not on the approved key certificate')
    }
    const securityLevel = verifyKeyDescription(extensions[0], challenge)
    const serials = chain.map(
      (certificate) => certificate.serialNumber.toLowerCase().replace(/^0+/, '') || '0'
    )
    if (!(await (options.revocation ?? officialAndroidAttestationRevocation)(serials))) {
      reject('Android attestation certificate is revoked or suspended')
    }
    return {
      hardwareBacked: true,
      securityLevel,
      verifiedBoot: true,
      biometricPerUse: true,
      leafCertificateFingerprintSha256: createHash('sha256').update(leaf.raw).digest('hex')
    }
  } catch (error) {
    if (error instanceof AndroidAttestationError) {
      throw error
    }
    throw new AndroidAttestationError(`Android attestation verification failed: ${String(error)}`)
  }
}
