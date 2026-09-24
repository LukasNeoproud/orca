import { afterEach, describe, expect, it } from 'vitest'
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DeviceApprovalMailbox } from './device-approval-mailbox'
import { approvalFixture } from '../../shared/device-approval-test-fixture'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'orca-approval-test-'))
  directories.push(directory)
  await chmod(directory, 0o700)
  await mkdir(join(directory, 'pending'), { mode: 0o700 })
  await mkdir(join(directory, 'responses'), { mode: 0o700 })
  const request = approvalFixture()
  const path = join(directory, 'pending', `${request.requestId}.json`)
  const payload = JSON.stringify(request)
  await writeFile(path, payload, { mode: 0o600 })
  return { directory, request, path, payload, mailbox: new DeviceApprovalMailbox(directory) }
}

describe('device approval mailbox', () => {
  it('preserves signed bytes and atomically accepts at most one concurrent response', async () => {
    const { directory, mailbox, payload, request } = await setup()
    expect(await mailbox.read(request.requestId)).toBe(payload)
    const response = {
      version: 1 as const,
      requestId: request.requestId,
      signatureDerBase64: 'signed'
    }
    const attempts = await Promise.allSettled([
      mailbox.respond(response),
      mailbox.respond(response)
    ])
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(
      JSON.parse(await readFile(join(directory, 'responses', `${request.requestId}.json`), 'utf8'))
    ).toEqual(response)
  })
  it('rejects symlinks, permissive files, traversal and expired requests', async () => {
    const { mailbox, path, request } = await setup()
    await chmod(path, 0o644)
    await expect(mailbox.read(request.requestId)).rejects.toThrow()
    await rm(path)
    await symlink('/dev/null', path)
    await expect(mailbox.read(request.requestId)).rejects.toThrow()
    await expect(mailbox.read('../outside')).rejects.toThrow()
    await rm(path)
    await writeFile(path, JSON.stringify({ ...request, createdAt: 1, expiresAt: 2 }), {
      mode: 0o600
    })
    await expect(
      mailbox.respond({ version: 1, requestId: request.requestId, signatureDerBase64: 'x' })
    ).rejects.toThrow()
  })
})
