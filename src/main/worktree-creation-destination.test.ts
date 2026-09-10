import { SshFilesystemProvider } from './providers/ssh-filesystem-provider'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handleEmptyDirectoryReservation } from '../relay/fs-empty-directory-reservation'
import { reserveWorktreeCreationDestination } from './worktree-creation-destination'
import type { IFilesystemProvider } from './providers/types'

let root: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-reservation-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

function provider() {
  return {
    reserveEmptyDirectory: (dirPath: string) =>
      handleEmptyDirectoryReservation({ dirPath, action: 'reserve' }),
    removeEmptyDirectory: (dirPath: string) =>
      handleEmptyDirectoryReservation({ dirPath, action: 'release' }),
    deletePath: vi.fn(() => {
      throw new Error('Recursive/path deletion must not be used')
    })
  } as unknown as IFilesystemProvider
}

describe('SSH worktree directory reservations', () => {
  it('releases an empty reservation after failed creation so retry succeeds', async () => {
    const path = join(root, 'nested', 'topic')
    const fs = provider()
    const cleanup = await reserveWorktreeCreationDestination(path, fs)
    await cleanup()
    const retryCleanup = await reserveWorktreeCreationDestination(path, fs)
    expect(await readdir(path)).toEqual([])
    await retryCleanup()
    expect(fs.deletePath).not.toHaveBeenCalled()
  })
  it('preserves a file written after reservation and before cleanup', async () => {
    const path = join(root, 'topic')
    const fs = provider()
    const cleanup = await reserveWorktreeCreationDestination(path, fs)
    await writeFile(join(path, 'user-file'), 'keep')
    await cleanup()
    expect(await readFile(join(path, 'user-file'), 'utf8')).toBe('keep')
    expect(fs.deletePath).not.toHaveBeenCalled()
  })
  it('refuses an old host before any parent or leaf directory is created', async () => {
    const createDir = vi.fn()
    const old = { createDir, createDirNoClobber: vi.fn() } as unknown as IFilesystemProvider
    await expect(reserveWorktreeCreationDestination(join(root, 'topic'), old)).rejects.toThrow(
      'does not support'
    )
    expect(createDir).not.toHaveBeenCalled()
    expect(await readdir(root)).toEqual([])
  })
  it('propagates old-relay method rejection before a reservation exists', async () => {
    const fs = provider()
    fs.reserveEmptyDirectory = async () => {
      throw new Error('Method not found')
    }
    await expect(reserveWorktreeCreationDestination(join(root, 'topic'), fs)).rejects.toThrow(
      'Method not found'
    )
    expect(await readdir(root)).toEqual([])
  })
})

it('uses the same relay method to reserve and release', async () => {
  const request = vi.fn().mockResolvedValue(undefined)
  const fs = new SshFilesystemProvider('ssh', { request, onNotification: () => () => {} } as never)
  const cleanup = await reserveWorktreeCreationDestination('/repo/topic', fs)
  await cleanup()
  expect(request).toHaveBeenNthCalledWith(1, 'fs.emptyDirectoryReservation', {
    dirPath: '/repo/topic',
    action: 'reserve'
  })
  expect(request).toHaveBeenNthCalledWith(2, 'fs.emptyDirectoryReservation', {
    dirPath: '/repo/topic',
    action: 'release'
  })
  fs.dispose()
})
