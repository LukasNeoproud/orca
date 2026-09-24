import { createHash, randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import { mkdir, open, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { EnrollmentResponseSchema } from '../../src/shared/device-approval-contract'
import { deviceApprovalDirectory } from '../../src/main/device-approval/device-approval-mailbox'
import { validateAndroidApprovalAttestation } from '../../src/main/device-approval/android-attestation'
import { runProcess } from '../../src/shared/child-process/run-process'

async function main() {
  if (process.platform !== 'darwin') {
    throw new Error('Local enrollment requires macOS')
  }
  const directory = deviceApprovalDirectory()
  for (const path of [directory, join(directory, 'pending'), join(directory, 'responses')]) {
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
  const request = {
    version: 1,
    kind: 'enrollment',
    requestId: randomBytes(16).toString('hex'),
    challengeBase64: randomBytes(32).toString('base64'),
    createdAt: Date.now(),
    expiresAt: Date.now() + 300_000
  }
  const pendingPath = join(directory, 'pending', `${request.requestId}.json`)
  const responsePath = join(directory, 'responses', `${request.requestId}.json`)
  const pending = await open(pendingPath, 'wx', 0o600)
  try {
    await pending.writeFile(JSON.stringify(request))
  } finally {
    await pending.close()
  }
  try {
    console.log(
      'Open this Mac in Orca Mobile → Device approvals → Register this phone. Waiting up to five minutes.'
    )
    let response
    while (Date.now() < request.expiresAt) {
      let file
      try {
        file = await open(responsePath, constants.O_RDONLY | constants.O_NOFOLLOW)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error
        }
        await new Promise((resolve) => setTimeout(resolve, 500))
        continue
      }
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
      break
    }
    if (!response || response.requestId !== request.requestId) {
      throw new Error('Enrollment expired')
    }
    const result = await validateAndroidApprovalAttestation({
      certificateChainBase64: response.attestationCertificateChainBase64,
      challengeBase64: request.challengeBase64,
      publicKeySpkiBase64: response.publicKeySpkiBase64
    })
    const fingerprint = createHash('sha256')
      .update(Buffer.from(response.publicKeySpkiBase64, 'base64'))
      .digest('hex')
    console.log(
      `Verified hardware attestation (${result.securityLevel}).\nPhone key fingerprint: ${fingerprint}`
    )
    const input = createInterface({ input: process.stdin, output: process.stdout })
    try {
      const confirmation = await input.question(
        'Compare with the phone. Type the first 12 fingerprint characters to enroll: '
      )
      if (confirmation !== fingerprint.slice(0, 12)) {
        throw new Error('Fingerprint confirmation did not match')
      }
    } finally {
      input.close()
    }
    if (Date.now() >= request.expiresAt) {
      throw new Error('Enrollment expired; start again')
    }
    const enrolled = await runProcess({
      program: join(homedir(), '.local', 'bin', 'touchid-keychain'),
      args: ['enroll-mobile', response.publicKeySpkiBase64],
      timeoutMs: 120_000,
      maxOutputBytes: 4096
    })
    if (enrolled.code !== 0 || enrolled.timedOut) {
      throw new Error('Local Touch ID enrollment failed')
    }
    console.log('Phone enrolled. Future private Android builds can use --approval mobile.')
  } finally {
    await rm(pendingPath, { force: true })
    await rm(responsePath, { force: true })
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Enrollment failed')
  process.exitCode = 1
})
