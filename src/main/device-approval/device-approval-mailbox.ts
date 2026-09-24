import { constants } from 'node:fs'
import { link, lstat, open, readdir, unlink } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  parseDeviceApprovalPayload,
  type ApprovalResponse,
  type EnrollmentResponse
} from '../../shared/device-approval-contract'

export const deviceApprovalDirectory = () => join(homedir(), '.config', 'orca', 'device-approvals')

async function checkPrivate(path: string, directory: boolean) {
  const stat = await lstat(path)
  if (
    stat.isSymbolicLink() ||
    (directory ? !stat.isDirectory() : !stat.isFile()) ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 0o077) !== 0
  ) {
    throw new Error('Device approval mailbox must be private and owned by this user')
  }
}

export class DeviceApprovalMailbox {
  constructor(private readonly directory = deviceApprovalDirectory()) {}

  private async checkDirectories() {
    await checkPrivate(this.directory, true)
    await checkPrivate(join(this.directory, 'pending'), true)
    await checkPrivate(join(this.directory, 'responses'), true)
  }

  async read(requestId: string): Promise<string> {
    if (!/^[a-f0-9]{32}$/.test(requestId)) {
      throw new Error('Invalid approval request ID')
    }
    await this.checkDirectories()
    const path = join(this.directory, 'pending', `${requestId}.json`)
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const stat = await file.stat()
      if (
        !stat.isFile() ||
        stat.uid !== process.getuid?.() ||
        (stat.mode & 0o077) !== 0 ||
        stat.size > 16_384
      ) {
        throw new Error('Invalid approval request file')
      }
      const payload = await file.readFile('utf8')
      const request = parseDeviceApprovalPayload(payload)
      if (request.requestId !== requestId) {
        throw new Error('Approval request ID mismatch')
      }
      return payload
    } finally {
      await file.close()
    }
  }

  async list(): Promise<{ supported: boolean; pending: { payload: string }[] }> {
    if (process.platform !== 'darwin') {
      return { supported: false, pending: [] }
    }
    try {
      await this.checkDirectories()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { supported: false, pending: [] }
      }
      throw error
    }
    const names = await readdir(join(this.directory, 'pending'))
    if (names.length > 32) {
      throw new Error('Too many pending approval files; clean up expired local requests')
    }
    const pending: { payload: string }[] = []
    for (const name of names) {
      if (!/^[a-f0-9]{32}\.json$/.test(name)) {
        continue
      }
      try {
        pending.push({ payload: await this.read(name.slice(0, -5)) })
      } catch {
        // Expired or incomplete requests cannot be approved.
      }
    }
    return { supported: true, pending }
  }

  async respond(response: ApprovalResponse | EnrollmentResponse): Promise<void> {
    await this.read(response.requestId)
    const target = join(this.directory, 'responses', `${response.requestId}.json`)
    const temporary = `${target}.${randomBytes(8).toString('hex')}.tmp`
    const file = await open(temporary, 'wx', 0o600)
    try {
      try {
        await file.writeFile(JSON.stringify(response))
        await file.sync()
      } finally {
        await file.close()
      }
      await this.read(response.requestId)
      // Hard-link publication is atomic and refuses to replace a prior response.
      await link(temporary, target)
    } finally {
      await unlink(temporary)
    }
  }
}

export const deviceApprovalMailbox = new DeviceApprovalMailbox()
