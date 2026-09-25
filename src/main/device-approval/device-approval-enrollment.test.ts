import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EnrollmentRequest } from '../../shared/device-approval-contract'
import { DeviceApprovalEnrollment } from './device-approval-enrollment'
import { DeviceApprovalMailbox } from './device-approval-mailbox'

let directory: string
let enrollment: DeviceApprovalEnrollment

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-approval-enrollment-'))
})

afterEach(async () => {
  if (enrollment) {
    await enrollment.cancel()
  }
  await rm(directory, { recursive: true, force: true })
})

async function pendingRequest(): Promise<EnrollmentRequest> {
  const names = await readdir(join(directory, 'pending'))
  expect(names).toHaveLength(1)
  return JSON.parse(await readFile(join(directory, 'pending', names[0]!), 'utf8'))
}

describe('DeviceApprovalEnrollment', () => {
  it('requires verified attestation, fingerprint confirmation, and local enrollment', async () => {
    const key = Buffer.alloc(91, 7).toString('base64')
    const validate = vi.fn(async () => ({
      hardwareBacked: true as const,
      securityLevel: 'tee' as const,
      verifiedBoot: true as const,
      biometricPerUse: true as const,
      leafCertificateFingerprintSha256: 'a'.repeat(64)
    }))
    const enroll = vi.fn(async () => true)
    enrollment = new DeviceApprovalEnrollment({
      directory,
      platform: 'darwin',
      validate,
      enroll
    })
    expect((await enrollment.start()).phase).toBe('waiting')
    const request = await pendingRequest()
    expect((await stat(join(directory, 'pending', `${request.requestId}.json`))).mode & 0o077).toBe(
      0
    )
    await new DeviceApprovalMailbox(directory).respond({
      version: 1,
      requestId: request.requestId,
      publicKeySpkiBase64: key,
      attestationCertificateChainBase64: ['AAAA', 'AAAA']
    })
    await vi.waitFor(() => expect(enrollment.status().phase).toBe('ready'))
    expect(validate).toHaveBeenCalledWith({
      certificateChainBase64: ['AAAA', 'AAAA'],
      challengeBase64: request.challengeBase64,
      publicKeySpkiBase64: key
    })
    const fingerprint = createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex')
    expect(enrollment.status().fingerprint).toBe(fingerprint)
    await expect(enrollment.confirm('000000000000')).rejects.toThrow(
      'Fingerprint confirmation did not match'
    )
    expect(enroll).not.toHaveBeenCalled()
    expect((await enrollment.confirm(fingerprint.slice(0, 12).toUpperCase())).phase).toBe(
      'complete'
    )
    expect(enroll).toHaveBeenCalledWith(key)
    expect(await readdir(join(directory, 'pending'))).toEqual([])
    expect(await readdir(join(directory, 'responses'))).toEqual([])
  })

  it('rejects a failed attestation without invoking the helper', async () => {
    const enroll = vi.fn(async () => true)
    enrollment = new DeviceApprovalEnrollment({
      directory,
      platform: 'darwin',
      validate: vi.fn(async () => {
        throw new Error('Invalid authentication policy')
      }),
      enroll
    })
    await enrollment.start()
    const request = await pendingRequest()
    await new DeviceApprovalMailbox(directory).respond({
      version: 1,
      requestId: request.requestId,
      publicKeySpkiBase64: Buffer.alloc(91, 7).toString('base64'),
      attestationCertificateChainBase64: ['AAAA', 'AAAA']
    })
    await vi.waitFor(() => expect(enrollment.status().phase).toBe('error'))
    expect(enrollment.status().error).toBe('Invalid authentication policy')
    expect(enroll).not.toHaveBeenCalled()
  })

  it('cancels a pending request and removes it from the phone mailbox', async () => {
    enrollment = new DeviceApprovalEnrollment({ directory, platform: 'darwin' })
    await enrollment.start()
    expect((await enrollment.cancel()).phase).toBe('idle')
    expect(await readdir(join(directory, 'pending'))).toEqual([])
  })
})
