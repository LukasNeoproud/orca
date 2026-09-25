import { createInterface } from 'node:readline/promises'
import { DeviceApprovalEnrollment } from '../../src/main/device-approval/device-approval-enrollment'

async function main() {
  const enrollment = new DeviceApprovalEnrollment()
  try {
    await enrollment.start()
    console.log(
      'In Orca Mobile, open Settings → Device approvals, select this Mac, then tap Register this phone. Waiting up to five minutes.'
    )
    let status = enrollment.status()
    while (status.phase === 'waiting' || status.phase === 'verifying') {
      await new Promise((resolve) => setTimeout(resolve, 500))
      status = enrollment.status()
    }
    if (status.phase !== 'ready' || !status.fingerprint) {
      throw new Error(status.error ?? 'Enrollment did not receive a verified phone key')
    }
    console.log(
      `Verified hardware attestation (${status.securityLevel}).\nPhone key fingerprint: ${status.fingerprint}`
    )
    const input = createInterface({ input: process.stdin, output: process.stdout })
    let confirmation: string
    try {
      confirmation = await input.question(
        'Compare with the phone. Type the first 12 fingerprint characters to enroll: '
      )
    } finally {
      input.close()
    }
    status = await enrollment.confirm(confirmation)
    if (status.phase !== 'complete') {
      throw new Error(status.error ?? 'Local Touch ID enrollment failed')
    }
    console.log('Phone enrolled for Device Approvals.')
  } finally {
    if (enrollment.status().phase !== 'complete') {
      await enrollment.cancel()
    }
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Enrollment failed')
  process.exitCode = 1
})
