import { createHash, randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import { mkdir, open, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  EnrollmentResponseSchema,
  type EnrollmentRequest
} from '../../shared/device-approval-contract'
import type { DeviceApprovalEnrollmentStatus } from '../../shared/device-approval-enrollment-status'
import { runProcess } from '@orca/process-host'
import { validateAndroidApprovalAttestation } from './android-attestation'
import { deviceApprovalDirectory } from './device-approval-mailbox'

type Session = {
  request: EnrollmentRequest
  pendingPath: string
  responsePath: string
  key?: string
  expiryTimer?: ReturnType<typeof setTimeout>
}
type EnrollmentDependencies = {
  directory?: string
  platform?: NodeJS.Platform
  validate?: typeof validateAndroidApprovalAttestation
  enroll?: (publicKeySpkiBase64: string) => Promise<boolean>
  now?: () => number
}

async function privateDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 })
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await handle.stat()
    if (!stat.isDirectory() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0) {
      throw new Error('Enrollment mailbox must be private and owned by this user')
    }
  } finally {
    await handle.close()
  }
}

async function enrollWithHelper(publicKeySpkiBase64: string): Promise<boolean> {
  const result = await runProcess({
    program: join(homedir(), '.local', 'bin', 'touchid-keychain'),
    args: ['enroll-mobile', publicKeySpkiBase64],
    timeoutMs: 120_000,
    maxOutputBytes: 4096
  })
  return result.code === 0 && !result.timedOut
}

export class DeviceApprovalEnrollment {
  private readonly directory: string
  private readonly platform: NodeJS.Platform
  private readonly validate: typeof validateAndroidApprovalAttestation
  private readonly enroll: (publicKeySpkiBase64: string) => Promise<boolean>
  private readonly now: () => number
  private active: Session | null = null
  private starting = false
  private state: DeviceApprovalEnrollmentStatus = { phase: 'idle' }

  constructor(dependencies: EnrollmentDependencies = {}) {
    this.directory = dependencies.directory ?? deviceApprovalDirectory()
    this.platform = dependencies.platform ?? process.platform
    this.validate = dependencies.validate ?? validateAndroidApprovalAttestation
    this.enroll = dependencies.enroll ?? enrollWithHelper
    this.now = dependencies.now ?? Date.now
  }

  status(): DeviceApprovalEnrollmentStatus {
    return { ...this.state }
  }

  async start(): Promise<DeviceApprovalEnrollmentStatus> {
    if (this.platform !== 'darwin') {
      throw new Error('Device approval enrollment requires macOS')
    }
    if (this.active || this.starting) {
      throw new Error('Device approval enrollment is already in progress')
    }
    try {
      this.starting = true
      const directory = this.directory
      for (const path of [directory, join(directory, 'pending'), join(directory, 'responses')]) {
        await privateDirectory(path)
      }
      const createdAt = this.now()
      const request: EnrollmentRequest = {
        version: 1,
        kind: 'enrollment',
        requestId: randomBytes(16).toString('hex'),
        challengeBase64: randomBytes(32).toString('base64'),
        createdAt,
        expiresAt: createdAt + 300_000
      }
      const session: Session = {
        request,
        pendingPath: join(directory, 'pending', `${request.requestId}.json`),
        responsePath: join(directory, 'responses', `${request.requestId}.json`)
      }
      const file = await open(session.pendingPath, 'wx', 0o600)
      try {
        await file.writeFile(JSON.stringify(request))
      } catch (error) {
        await rm(session.pendingPath, { force: true })
        throw error
      } finally {
        await file.close()
      }
      this.active = session
      this.state = { phase: 'waiting', expiresAt: request.expiresAt }
      session.expiryTimer = setTimeout(() => {
        if (this.active === session && this.state.phase !== 'confirming') {
          void this.fail(session, new Error('Enrollment expired; start again'))
        }
      }, request.expiresAt - this.now())
      void this.waitForResponse(session)
      return this.status()
    } finally {
      this.starting = false
    }
  }

  async confirm(fingerprintPrefix: string): Promise<DeviceApprovalEnrollmentStatus> {
    const session = this.active
    if (!session || this.state.phase !== 'ready' || !session.key || !this.state.fingerprint) {
      throw new Error('No verified phone key is ready for enrollment')
    }
    if (this.now() >= session.request.expiresAt) {
      await this.fail(session, new Error('Enrollment expired; start again'))
      return this.status()
    }
    if (fingerprintPrefix.toLowerCase() !== this.state.fingerprint.slice(0, 12)) {
      throw new Error('Fingerprint confirmation did not match')
    }
    this.state = { ...this.state, phase: 'confirming' }
    try {
      const enrolled = await this.enroll(session.key)
      if (!enrolled) {
        throw new Error('Local Touch ID enrollment failed or was cancelled')
      }
      this.state = { ...this.state, phase: 'complete' }
      await this.cleanup(session)
    } catch (error) {
      await this.fail(session, error)
    }
    return this.status()
  }

  async cancel(): Promise<DeviceApprovalEnrollmentStatus> {
    if (this.starting) {
      throw new Error('Wait for the enrollment request to start')
    }
    if (this.state.phase === 'confirming') {
      throw new Error('Wait for the local Touch ID result')
    }
    const session = this.active
    this.state = { phase: 'idle' }
    if (session) {
      await this.cleanup(session)
    }
    return this.status()
  }

  private async waitForResponse(session: Session): Promise<void> {
    while (this.active === session && this.now() < session.request.expiresAt) {
      try {
        const file = await open(session.responsePath, constants.O_RDONLY | constants.O_NOFOLLOW)
        let response
        try {
          const stat = await file.stat()
          if (
            !stat.isFile() ||
            stat.uid !== process.getuid?.() ||
            (stat.mode & 0o077) !== 0 ||
            stat.size > 262_144
          ) {
            throw new Error('Invalid enrollment response file')
          }
          response = EnrollmentResponseSchema.parse(JSON.parse(await file.readFile('utf8')))
        } finally {
          await file.close()
        }
        if (response.requestId !== session.request.requestId) {
          throw new Error('Enrollment response ID mismatch')
        }
        this.state = { phase: 'verifying', expiresAt: session.request.expiresAt }
        const result = await this.validate({
          certificateChainBase64: response.attestationCertificateChainBase64,
          challengeBase64: session.request.challengeBase64,
          publicKeySpkiBase64: response.publicKeySpkiBase64
        })
        if (this.active !== session) {
          return
        }
        session.key = response.publicKeySpkiBase64
        this.state = {
          phase: 'ready',
          expiresAt: session.request.expiresAt,
          fingerprint: createHash('sha256')
            .update(Buffer.from(response.publicKeySpkiBase64, 'base64'))
            .digest('hex'),
          securityLevel: result.securityLevel
        }
        return
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          await this.fail(session, error)
          return
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    if (this.active === session) {
      await this.fail(session, new Error('Enrollment expired; start again'))
    }
  }

  private async fail(session: Session, error: unknown): Promise<void> {
    if (this.active !== session) {
      return
    }
    this.state = {
      phase: 'error',
      error: error instanceof Error ? error.message : 'Device approval enrollment failed'
    }
    await this.cleanup(session)
  }

  private async cleanup(session: Session): Promise<void> {
    clearTimeout(session.expiryTimer)
    if (this.active === session) {
      this.active = null
    }
    await Promise.all([
      rm(session.pendingPath, { force: true }),
      rm(session.responsePath, { force: true })
    ])
  }
}

export const deviceApprovalEnrollment = new DeviceApprovalEnrollment()
