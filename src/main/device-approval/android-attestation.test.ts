import { readFileSync } from 'node:fs'
import { X509Certificate } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { validateAndroidApprovalAttestation } from './android-attestation'
import { GOOGLE_ANDROID_ATTESTATION_ROOTS } from './android-attestation-roots'

type SignedFixtures = {
  challengeBase64: string
  publicKeySpkiBase64: string
  rootBase64: string
  rootPem: string
  leaves: Record<string, string>
}

const fixture = JSON.parse(
  readFileSync(new URL('./__fixtures__/android-attestation-signed.json', import.meta.url), 'utf8')
) as SignedFixtures
const at = new Date('2026-09-25T00:00:00.000Z')

function options(leaf = 'valid') {
  return {
    certificateChainBase64: [fixture.leaves[leaf]!, fixture.rootBase64],
    challengeBase64: fixture.challengeBase64,
    publicKeySpkiBase64: fixture.publicKeySpkiBase64,
    trustRoots: [fixture.rootPem],
    revocation: vi.fn(async (_serials: readonly string[]) => true),
    now: at
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('Android approval attestation', () => {
  it('pins both current Google roots, including the 2026 rotation', () => {
    expect(GOOGLE_ANDROID_ATTESTATION_ROOTS).toHaveLength(2)
    for (const root of GOOGLE_ANDROID_ATTESTATION_ROOTS) {
      const certificate = new X509Certificate(root)
      expect(certificate.ca).toBe(true)
      expect(certificate.verify(certificate.publicKey)).toBe(true)
    }
  })

  it('accepts signed TEE and StrongBox biometric per-use keys', async () => {
    for (const [leaf, securityLevel] of [
      ['valid', 'tee'],
      ['strongbox', 'strongbox']
    ] as const) {
      const input = options(leaf)
      await expect(validateAndroidApprovalAttestation(input)).resolves.toMatchObject({
        hardwareBacked: true,
        securityLevel,
        verifiedBoot: true,
        biometricPerUse: true
      })
      expect(input.revocation).toHaveBeenCalledOnce()
      expect(input.revocation.mock.calls[0]?.[0]).toHaveLength(2)
    }
  })

  it.each([
    ['wrongChallenge', 'challenge'],
    ['software', 'hardware backed'],
    ['credential', 'biometric'],
    ['mixedAuth', 'biometric'],
    ['timeout', 'biometric'],
    ['noAuth', 'authentication'],
    ['unlocked', 'locked'],
    ['unverifiedBoot', 'locked'],
    ['wrongDigest', 'P-256'],
    ['wrongPurpose', 'P-256'],
    ['noOrigin', 'authorization 702']
  ])('rejects signed %s certificate', async (leaf, message) => {
    await expect(validateAndroidApprovalAttestation(options(leaf))).rejects.toThrow(message)
  })

  it('rejects an untrusted root, mismatched key, and altered signed certificate', async () => {
    const untrusted = options()
    delete (untrusted as { trustRoots?: string[] }).trustRoots
    await expect(validateAndroidApprovalAttestation(untrusted)).rejects.toThrow(
      'trusted Google root'
    )

    const wrongKey = options()
    wrongKey.publicKeySpkiBase64 = Buffer.alloc(91).toString('base64')
    await expect(validateAndroidApprovalAttestation(wrongKey)).rejects.toThrow('does not match')

    const altered = options()
    const der = Buffer.from(altered.certificateChainBase64[0]!, 'base64')
    der[der.length - 1] ^= 1
    altered.certificateChainBase64[0] = der.toString('base64')
    await expect(validateAndroidApprovalAttestation(altered)).rejects.toThrow('signature')
  })

  it('rejects expired certificates and revoked serials', async () => {
    await expect(
      validateAndroidApprovalAttestation({ ...options(), now: new Date('2050-01-01') })
    ).rejects.toThrow('validity period')
    await expect(
      validateAndroidApprovalAttestation({ ...options(), revocation: async () => false })
    ).rejects.toThrow('revoked or suspended')
  })

  it('fails closed when the official revocation feed is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      })
    )
    const input = options()
    delete (input as { revocation?: unknown }).revocation
    await expect(validateAndroidApprovalAttestation(input)).rejects.toThrow('offline')
  })
})
